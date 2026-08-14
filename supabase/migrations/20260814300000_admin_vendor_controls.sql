-- Admin monitoring page for vendors: lets an admin force a vendor stall
-- open/closed (same vendors.is_open field the vendor dashboard toggles)
-- and see each stall's owner. vendors has public read + owner-only update
-- today; this adds the missing admin write path. users only allows
-- reading one's own row; this adds admin read so the vendors->users
-- owner join works.

create policy "vendors: admin update"
  on public.vendors for update
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

create policy "users: admin read"
  on public.users for select
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
