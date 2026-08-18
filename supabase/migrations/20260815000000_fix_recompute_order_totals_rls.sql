-- Migration: fix_recompute_order_totals_rls
-- recompute_order_totals (added in fix_order_item_pricing) is a plain
-- SECURITY INVOKER trigger function that UPDATEs public.orders after every
-- order_items insert/update/delete. Running as the invoking student, that
-- UPDATE is subject to orders' RLS UPDATE policies — but the only two
-- student UPDATE policies gate their WITH CHECK on a specific status
-- transition ('pending'->'cancelled', 'ready'->'completed'). A totals-only
-- update (status unchanged, still 'pending') satisfies neither, so every
-- order_items insert during checkout fails with "new row violates row-level
-- security policy for table \"orders\"" — the order row itself was already
-- committed by a prior request, so it's left behind as an orphaned pending
-- order with zero order_items every time.
--
-- This is system-computed bookkeeping, not a user-initiated status change,
-- so run it as SECURITY DEFINER like the other cross-table writes in this
-- file (place_order_escrow, release_escrow_to_vendor, refund_escrow).

create or replace function public.recompute_order_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_subtotal numeric;
begin
  select coalesce(sum(quantity * unit_price), 0)
    into v_subtotal
    from public.order_items
   where order_id = v_order_id;

  update public.orders
     set subtotal = v_subtotal,
         total_amount = v_subtotal + packaging_fee
   where id = v_order_id;

  return null;
end;
$$;
