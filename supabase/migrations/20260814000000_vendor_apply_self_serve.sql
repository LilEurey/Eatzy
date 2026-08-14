-- Migration: vendor_apply_self_serve
-- Replaces the fixed-pool "claim an existing stall" onboarding model with a
-- self-serve one: an applicant now describes their own business (name,
-- on/off-campus, stall number or address) instead of picking a pre-seeded
-- vendors row. Approval creates a new vendors row from the application
-- instead of claiming one, so growth is no longer capped by how many empty
-- stall rows an admin pre-seeded, and off-campus vendors are a normal case
-- instead of a schema rewrite.

alter table public.vendors
  add column is_on_campus boolean not null default true,
  add column address text;

alter table public.vendor_applications
  add column business_name text,
  add column is_on_campus boolean not null default true,
  add column stall_number text,
  add column address text;

-- Backfill business_name from the vendor rows applications used to claim,
-- for any pre-existing rows, before making it required going forward.
update public.vendor_applications a
   set business_name = v.name,
       stall_number = v.stall_number
  from public.vendors v
 where a.vendor_id = v.id
   and a.business_name is null;

alter table public.vendor_applications
  alter column business_name set not null;

-- vendor_id is now populated by approval (it points at the vendors row
-- approval creates), not supplied by the applicant at submit time.
alter table public.vendor_applications
  alter column vendor_id drop not null;

-- No more racing for a fixed pool of stalls, so this constraint is
-- meaningless — vendor_id isn't even known at apply time anymore.
drop index if exists public.vendor_applications_one_pending_per_vendor;

-- ─── approve_vendor_application: claim → create ────────────────────────────
-- Previously updated an existing vendors row's owner_user_id. Now inserts a
-- brand-new vendors row from the application's own business details and
-- links the application to it, since there's no pre-existing row to claim.
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

  insert into public.vendors (name, stall_number, is_on_campus, address, bio, owner_user_id)
  values (
    v_application.business_name,
    v_application.stall_number,
    v_application.is_on_campus,
    v_application.address,
    v_application.bio,
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
