-- Migration: provision_vendor
-- Vendor accounts are now created by an admin (email/password), not self-serve
-- via a Google identity. This RPC is the server-side half: given a freshly
-- created auth user, spin up their vendors row and flip their role. The auth
-- account itself is created by the admin-create-vendor edge function via
-- auth.admin.createUser just before this runs.
--
-- Mirrors approve_vendor_application (20260814100000) minus the
-- vendor_applications bookkeeping. Location (on/off-campus, stall number,
-- address) is left at defaults and edited later from the vendor profile.

create or replace function public.provision_vendor(
  p_user_id       uuid,
  p_business_name text,
  p_cuisine_tags  text[]
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid;
begin
  insert into public.vendors (name, cuisine_tags, owner_user_id)
  values (p_business_name, coalesce(p_cuisine_tags, '{}'), p_user_id)
  returning id into v_vendor_id;

  -- prevent_privileged_self_update (20260806000000) blocks any direct role
  -- change unless this transaction-local GUC is set first.
  perform set_config('app.bypass_role_guard', 'on', true);
  update public.users set role = 'vendor' where id = p_user_id;

  if not found then
    raise exception 'user_not_found';
  end if;

  return v_vendor_id;
end;
$$;

revoke execute on function public.provision_vendor(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.provision_vendor(uuid, text, text[]) to service_role;
