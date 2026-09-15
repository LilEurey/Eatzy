-- Migration: sync_vendor_queue_count
-- vendors.current_queue_count (read by store/[id].tsx, stores.tsx, and the
-- (tabs)/index.tsx home feed for "N orders" / "No Queue") was only ever set
-- by seed scripts — nothing recomputed it when real orders were placed,
-- accepted, rejected, readied, completed, cancelled, or rolled back (cart.tsx
-- deletes the row on a failed payment). Every one of those paths left the
-- column stale, so a vendor could carry live pending/accepted orders and
-- still show "No Queue" / "0 orders" everywhere. Same trigger-not-callsite
-- reasoning as notify_order_status_change() (20260818040000): order status
-- is set from several places (vendor-store.ts, finalize_order_handoff(),
-- this migration's own seed siblings), so a trigger catches all of them,
-- including future ones, instead of each call site remembering to also
-- update the vendor row.
create or replace function public.sync_vendor_queue_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid := coalesce(new.vendor_id, old.vendor_id);
begin
  update public.vendors
     set current_queue_count = (
       select count(*) from public.orders
        where vendor_id = v_vendor_id
          and status in ('pending', 'accepted')
     )
   where id = v_vendor_id;

  return coalesce(new, old);
end;
$$;

create trigger orders_sync_vendor_queue_count
  after insert or update or delete on public.orders
  for each row
  execute function public.sync_vendor_queue_count();

-- Backfill every vendor's stale count from real orders right now (not just
-- Dino Papa — any vendor with live orders was equally wrong).
update public.vendors v
   set current_queue_count = (
     select count(*) from public.orders o
      where o.vendor_id = v.id
        and o.status in ('pending', 'accepted')
   );
