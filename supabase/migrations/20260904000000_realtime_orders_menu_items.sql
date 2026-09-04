-- Realtime for order status + menu changes.
--
-- Both sides already subscribe to postgres_changes:
--   • src/app/track/[id].tsx        — UPDATE on orders  (filter id=eq.<order>)
--   • src/lib/vendor-store.ts       — * on orders / menu_items (filter vendor_id)
-- ...but the events never arrived because only public.notifications was ever
-- added to the supabase_realtime publication (see 20260818040000). So the
-- student had to leave/re-enter Track and the vendor had to refetch to see a
-- status change the other party made. Add the two missing tables.
--
-- REPLICA IDENTITY FULL so Realtime can evaluate RLS + the vendor_id filter
-- against the full row on UPDATE/DELETE (default identity exposes the PK only).

alter table public.orders replica identity full;
alter table public.menu_items replica identity full;

-- Guarded for idempotency in case the publication is already FOR ALL TABLES
-- or the table is already a member.
do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.menu_items;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
