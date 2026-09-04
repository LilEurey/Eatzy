-- Migration: charge_on_vendor_accept
-- Moves the wallet deduction from order placement (place_order_escrow,
-- called from cart.tsx right after the order row is inserted) to vendor
-- acceptance. Before this, a student's money was held from the instant
-- they placed an order — before any vendor had even seen it — with no way
-- to back out. Now:
--
--   - Placing an order just inserts the row (status 'pending'). No charge.
--   - Vendor accept calls this RPC, which is the new charge point.
--   - Vendor reject / student cancel (both only possible pre-accept) are
--     plain status flips — nothing to refund since nothing was charged.
--   - Handoff/payout (finalize_order_handoff) is unchanged: it already
--     only acts on a payments row with status = 'pending', which now only
--     comes into existence post-accept instead of post-placement.
--
-- place_order_escrow is dropped outright rather than left dormant — same
-- precedent as 20260828000000_drop_release_escrow_to_vendor.sql: an unused
-- SECURITY DEFINER wallet-mutating RPC left reachable over PostgREST is a
-- liability, not a convenience. No application code calls it once this
-- ships (see cart.tsx change in the same overall change).
--
-- refund_escrow is untouched — still correct for refunding a payments row
-- with status = 'pending' — but nothing currently calls it either
-- (vendor-store.ts's rejectOrder loses its call in the same overall
-- change, since reject-after-charge isn't a path that exists in the UI).
-- Left in place for future accepted-order-cancel work.

drop function if exists public.place_order_escrow(uuid, uuid, numeric);

create or replace function public.accept_order_and_charge(p_order_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid;
  v_owner_id  uuid;
  v_user_id   uuid;
  v_amount    numeric;
  v_status    text;
begin
  select o.vendor_id, o.user_id, o.total_amount, o.status
    into v_vendor_id, v_user_id, v_amount, v_status
    from public.orders o
   where o.id = p_order_id
   for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  select owner_user_id into v_owner_id from public.vendors where id = v_vendor_id;

  if auth.uid() is distinct from v_owner_id then
    raise exception 'not_authorized';
  end if;

  if v_status <> 'pending' then
    raise exception 'order_not_pending';
  end if;

  if exists (
    select 1
      from public.order_items oi
      join public.menu_item_addon_groups g on g.menu_item_id = oi.menu_item_id
      left join public.order_item_addons oia
        on oia.order_item_id = oi.id
       and oia.addon_id in (
         select id from public.menu_item_addons where group_id = g.id
       )
     where oi.order_id = p_order_id
     group by oi.id, g.id, g.min_select, g.max_select
    having count(oia.id) < g.min_select
        or (g.max_select is not null and count(oia.id) > g.max_select)
  ) then
    raise exception 'addon_rule_violation';
  end if;

  perform set_config('app.bypass_wallet_guard', 'on', true);

  update public.users
     set wallet_balance = wallet_balance - v_amount
   where id = v_user_id
     and wallet_balance >= v_amount;

  if not found then
    update public.orders set status = 'rejected' where id = p_order_id;
    return 'insufficient_balance';
  end if;

  insert into public.payments (order_id, amount, method, status)
  values (p_order_id, v_amount, 'wallet', 'pending');

  insert into public.wallet_transactions (user_id, type, amount, reference, description)
  values (v_user_id, 'payment', -v_amount, p_order_id::text, 'Order payment held in escrow');

  update public.orders set status = 'accepted' where id = p_order_id;

  return 'accepted';
end;
$$;

revoke execute on function public.accept_order_and_charge(uuid) from public, anon;
grant execute on function public.accept_order_and_charge(uuid) to authenticated;
