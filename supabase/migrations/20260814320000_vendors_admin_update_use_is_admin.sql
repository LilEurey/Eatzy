-- "vendors: admin update" (added in 20260814300000) still checks admin
-- status via an inline correlated subquery on public.users, duplicating
-- the logic now centralized in public.is_admin() (20260814310000). Repoint
-- it at the helper so there's one source of truth for the admin check.

drop policy "vendors: admin update" on public.vendors;

create policy "vendors: admin update"
  on public.vendors for update
  using (public.is_admin());
