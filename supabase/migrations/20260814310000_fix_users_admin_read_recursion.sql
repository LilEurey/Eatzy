-- Hotfix: "users: admin read" (added in 20260814300000) is self-referential —
-- its USING clause selects from public.users, the same table the policy is
-- defined on, which Postgres cannot resolve and fails with
-- "infinite recursion detected in policy for relation users" (42P17) on
-- EVERY select against public.users, breaking login/session checks for all
-- roles, not just admin. Fix: check admin status via a SECURITY DEFINER
-- helper function instead of an inline correlated subquery — the function
-- runs as its owner (bypassing RLS on the read inside it), so it doesn't
-- re-trigger policy evaluation on public.users.

drop policy "users: admin read" on public.users;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;

create policy "users: admin read"
  on public.users for select
  using (public.is_admin());
