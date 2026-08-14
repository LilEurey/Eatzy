-- Migration: vendor_apply_basic_info_only
-- Applying no longer asks for location at all (on/off-campus, stall
-- number, address) — just store name, what they sell, and contact info.
-- Location stays editable in the vendor profile after approval, where the
-- on/off-campus toggle already lives.

alter table public.vendor_applications
  add column cuisine_tags text[] not null default '{}';

-- approve_vendor_application: carry cuisine_tags into the new vendors row too.
create or replace function public.approve_vendor_application(
  p_application_id uuid,
  p_admin_id       uuid
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_application public.vendor_applications%rowtype;
  v_vendor_id   uuid;
begin
  select * into v_application
    from public.vendor_applications
   where id = p_application_id
     and status = 'pending'
   for update;

  if not found then
    raise exception 'application_not_found_or_already_reviewed';
  end if;

  if v_application.applicant_user_id is null then
    raise exception 'application_missing_applicant';
  end if;

  insert into public.vendors (name, stall_number, is_on_campus, address, bio, cuisine_tags, owner_user_id)
  values (
    v_application.business_name,
    v_application.stall_number,
    v_application.is_on_campus,
    v_application.address,
    v_application.bio,
    v_application.cuisine_tags,
    v_application.applicant_user_id
  )
  returning id into v_vendor_id;

  perform set_config('app.bypass_role_guard', 'on', true);
  update public.users set role = 'vendor' where id = v_application.applicant_user_id;

  update public.vendor_applications
     set status = 'approved', reviewed_by = p_admin_id, reviewed_at = now(), vendor_id = v_vendor_id
   where id = p_application_id;
end;
$$;

revoke execute on function public.approve_vendor_application(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_vendor_application(uuid, uuid) to service_role;
