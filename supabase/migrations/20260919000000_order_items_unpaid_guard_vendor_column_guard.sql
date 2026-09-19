-- Migration: order_items_unpaid_guard_vendor_column_guard
-- Two holes from the 2026-09-19 full-codebase review.
--
-- C1: "order_items: insert via own order" only checked ownership. A student
-- could insert order_items on an order that was already accepted/charged;
-- recompute_order_totals (SECURITY DEFINER) then rewrote orders.total_amount
-- while payments.amount stayed frozen, and transfer-order-payout paid the
-- vendor's Stripe account from the inflated total. Same unpaid-order guard
-- order_item_addons already has (20260831040000): own order, still pending,
-- no payment row yet. Checkout inserts items before the vendor accepts, so
-- the legit flow passes. (transfer-order-payout now also pays payments.amount.)
--
-- H3: "vendors: owner update" has no column limit, so an owner could PATCH
-- stripe_payouts_enabled / stripe_account_id / owner_user_id /
-- current_queue_count on their own row. The guard trigger rejects those
-- changes for direct client writes only. current_user is 'authenticated' for
-- a PostgREST call from a signed-in user, but the definer (postgres) inside
-- SECURITY DEFINER functions (sync_vendor_queue_count, provision_vendor) and
-- 'service_role' for the Stripe edge functions, so those keep working.

-- ─── C1 ──────────────────────────────────────────────────────────────────────
drop policy "order_items: insert via own order" on public.order_items;

create policy "order_items: insert via own unpaid order"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.user_id = auth.uid()
        and o.status = 'pending'
    )
    and not exists (
      select 1 from public.payments p where p.order_id = order_items.order_id
    )
  );

-- ─── H3 ──────────────────────────────────────────────────────────────────────
create or replace function public.prevent_vendor_privileged_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.owner_user_id          is distinct from old.owner_user_id
    or new.stripe_account_id      is distinct from old.stripe_account_id
    or new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled
    or new.current_queue_count    is distinct from old.current_queue_count
  ) then
    raise exception 'vendor ownership, Stripe, and queue fields cannot be changed via direct update';
  end if;
  return new;
end;
$$;

create trigger vendors_prevent_privileged_self_update
  before update on public.vendors
  for each row execute function public.prevent_vendor_privileged_self_update();

revoke execute on function public.prevent_vendor_privileged_self_update() from public, anon, authenticated;
