-- Migration: orders_client_update_guard
-- Findings from the 2026-09-21 security audit.
--
-- H1/H2: "orders: vendor owner updates own stall" and "orders: student cancels
-- own pending" have no column limit. A vendor could PATCH user_id / total_amount
-- on their own order (pointing it at another student, or inflating the price)
-- and then call accept_order_and_charge, which reads both columns after
-- locking the row; a student could lower total_amount on their own pending
-- order; a vendor could set student_picked_up_at to skip the student's
-- confirmation, or null stripe_transfer_id to re-trigger a payout.
--
-- The client only ever sends { status } directly (order-lifecycle.ts), and only
-- for pending -> cancelled, pending -> rejected and accepted -> ready. Every
-- other write to orders happens inside SECURITY DEFINER RPCs/triggers, where
-- current_user is the definer (postgres), or from edge functions as
-- service_role. So: for direct writes from a signed-in client (current_user
-- 'authenticated' / 'anon', the same pattern as the vendors guard in
-- 20260919000000) reject any column change other than status, and restrict
-- which status moves are allowed. pending -> accepted (the charge) and
-- anything to completed stay RPC-only.
--
-- M: an INSERT could pre-set stripe_transfer_id, which makes
-- transfer-order-payout treat the order as already paid out.
-- M: "ratings: update own" had no completed-order check (only INSERT was
-- fixed in 20260909000000), so a rating could be re-pointed at any item.
-- M: the image buckets accepted any content type up to the global 50MiB.

-- ─── orders: direct client updates may only move status along legal edges ────
create or replace function public.guard_orders_client_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Whole-row comparison (minus status) so new columns are protected by default.
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'orders: only status can be changed directly';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'pending'  and new.status in ('rejected', 'cancelled')) or
    (old.status = 'accepted' and new.status = 'ready')
  ) then
    raise exception 'orders: % -> % must go through its RPC', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_orders_client_update() from public, anon, authenticated;

drop trigger if exists orders_guard_client_update on public.orders;
create trigger orders_guard_client_update
  before update on public.orders
  for each row
  execute function public.guard_orders_client_update();

-- ─── orders: no pre-set payout marker on insert ───────────────────────────────
alter policy "orders: student inserts own"
  on public.orders
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and vendor_handed_off_at is null
    and student_picked_up_at is null
    and stripe_transfer_id is null
  );

-- ─── ratings: an edit must still reference the caller's completed order ───────
alter policy "ratings: update own"
  on public.ratings
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
       where o.id = ratings.order_id
         and o.user_id = auth.uid()
         and o.status = 'completed'
         and oi.menu_item_id = ratings.menu_item_id
    )
  );

-- ─── storage: images only, bounded size ──────────────────────────────────────
-- Blocks html/svg (script hosted on the project's storage origin). heic/heif
-- kept because the iOS picker can hand those over as-is.
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
 where id in ('avatars', 'menu-item-images', 'review-photos', 'vendor-images');
