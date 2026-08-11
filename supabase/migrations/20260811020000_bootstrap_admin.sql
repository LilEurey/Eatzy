-- Migration: bootstrap_admin
-- One-time helper to promote the very first admin account. Ordinary vendor
-- approval (approve_vendor_application) can check the caller is already an
-- admin — this can't, since there isn't one yet. The "no admin exists yet"
-- guard is the substitute safety check, and the companion Edge Function
-- that calls this is deleted immediately after use — see project chat log,
-- not meant to stay deployed.
create or replace function public.bootstrap_admin(
  p_user_id uuid
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.users where role = 'admin') then
    raise exception 'admin_already_exists';
  end if;

  perform set_config('app.bypass_role_guard', 'on', true);
  update public.users set role = 'admin' where id = p_user_id;

  if not found then
    raise exception 'user_not_found';
  end if;
end;
$$;

revoke execute on function public.bootstrap_admin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_admin(uuid) to service_role;
