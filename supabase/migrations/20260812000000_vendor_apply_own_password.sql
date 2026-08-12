-- Migration: vendor_apply_own_password
-- Vendors now set their own password at apply time (apply-vendor-application
-- Edge Function creates their auth account immediately, inert until
-- approved) instead of admin approval generating and relaying a temp
-- password. See docs/superpowers/specs/2026-08-12-vendor-apply-own-password-design.md.

alter table public.vendor_applications
  add column applicant_user_id uuid references public.users(id) on delete set null;

-- The client no longer inserts this table directly — apply-vendor-application
-- does it (service_role, after creating the auth account), since creating a
-- password-login account is an Admin API operation that can't run from a
-- plain anon client insert.
drop policy if exists "vendor_applications: public insert" on public.vendor_applications;

-- Signature changes (drops p_new_user_id — the applicant's account already
-- exists by approval time now, so the RPC looks it up from the row itself
-- instead of trusting an id passed in by the caller).
drop function if exists public.approve_vendor_application(uuid, uuid, uuid);

create or replace function public.approve_vendor_application(
  p_application_id uuid,
  p_admin_id       uuid
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid;
  v_applicant_user_id uuid;
begin
  select vendor_id, applicant_user_id into v_vendor_id, v_applicant_user_id
    from public.vendor_applications
   where id = p_application_id
     and status = 'pending'
   for update;

  if not found then
    raise exception 'application_not_found_or_already_reviewed';
  end if;

  if v_applicant_user_id is null then
    raise exception 'application_missing_applicant';
  end if;

  update public.vendors
     set owner_user_id = v_applicant_user_id
   where id = v_vendor_id
     and owner_user_id is null;

  if not found then
    raise exception 'stall_already_claimed';
  end if;

  perform set_config('app.bypass_role_guard', 'on', true);
  update public.users set role = 'vendor' where id = v_applicant_user_id;

  update public.vendor_applications
     set status = 'approved', reviewed_by = p_admin_id, reviewed_at = now()
   where id = p_application_id;
end;
$$;

revoke execute on function public.approve_vendor_application(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_vendor_application(uuid, uuid) to service_role;
