-- Migration: vendor_applications
-- Self-serve vendor onboarding: an applicant claims an existing (unclaimed)
-- vendors row via a public application; an admin reviews it in the admin
-- panel and approves/rejects. Approval creates the applicant's auth account
-- and links ownership — see approve-vendor-application Edge Function.

create table public.vendor_applications (
  id            uuid        default gen_random_uuid() primary key,
  vendor_id     uuid        not null references public.vendors(id) on delete cascade,
  full_name     text        not null,
  email         text        not null,
  phone         text        not null,
  bio           text,
  status        text        not null default 'pending'
                             check (status in ('pending', 'approved', 'rejected')),
  reviewer_note text,
  reviewed_by   uuid        references public.users(id) on delete set null,
  reviewed_at   timestamptz,
  submitted_at  timestamptz not null default now()
);

-- Only one open claim per stall at a time — the next applicant simply can't
-- submit until the pending one is resolved (approved/rejected), so the
-- admin never has to untangle competing claims for the same physical stall.
create unique index vendor_applications_one_pending_per_vendor
  on public.vendor_applications (vendor_id)
  where status = 'pending';

alter table public.vendor_applications enable row level security;

-- No account exists yet at apply time, so submission has to be public.
create policy "vendor_applications: public insert"
  on public.vendor_applications for insert
  with check (status = 'pending' and reviewed_by is null and reviewed_at is null);

-- Only admins can see or act on applications.
create policy "vendor_applications: admin read"
  on public.vendor_applications for select
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

create policy "vendor_applications: admin update"
  on public.vendor_applications for update
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));


-- ─── Trusted server-side bypass for role assignment ────────────────────────
-- prevent_privileged_self_update (fix_users_privilege_escalation) blocks
-- every direct change to users.role/wallet_balance, including from
-- SECURITY DEFINER functions — there was previously no legitimate path that
-- needed to flip role at all. Vendor approval is the first one, so give the
-- trigger a narrow, transaction-scoped escape hatch that only
-- approve_vendor_application below sets, rather than weakening the guard
-- generally.
create or replace function public.prevent_privileged_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.bypass_role_guard', true) = 'on' then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'role cannot be changed via direct update';
  end if;
  if new.wallet_balance is distinct from old.wallet_balance then
    raise exception 'wallet_balance cannot be changed via direct update, use topup_wallet/escrow RPCs';
  end if;
  return new;
end;
$$;


-- ─── approve_vendor_application ────────────────────────────────────────────
-- Called only by the approve-vendor-application Edge Function, after it has
-- created the applicant's auth user with the service_role key. Links the
-- new user to the claimed stall, promotes them to 'vendor', and closes out
-- the application in one transaction, so a mid-way failure can't leave an
-- orphaned auth user or a half-approved application.
create or replace function public.approve_vendor_application(
  p_application_id uuid,
  p_new_user_id    uuid,
  p_admin_id       uuid
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid;
begin
  select vendor_id into v_vendor_id
    from public.vendor_applications
   where id = p_application_id
     and status = 'pending'
   for update;

  if not found then
    raise exception 'application_not_found_or_already_reviewed';
  end if;

  update public.vendors
     set owner_user_id = p_new_user_id
   where id = v_vendor_id
     and owner_user_id is null;

  if not found then
    raise exception 'stall_already_claimed';
  end if;

  perform set_config('app.bypass_role_guard', 'on', true);
  update public.users set role = 'vendor' where id = p_new_user_id;

  update public.vendor_applications
     set status = 'approved', reviewed_by = p_admin_id, reviewed_at = now()
   where id = p_application_id;
end;
$$;

-- Locked to service_role: this must only ever be invoked from inside the
-- Edge Function (which already verified the caller is an admin), never
-- directly by an authenticated client — it promotes a user to vendor.
revoke execute on function public.approve_vendor_application(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_vendor_application(uuid, uuid, uuid) to service_role;
