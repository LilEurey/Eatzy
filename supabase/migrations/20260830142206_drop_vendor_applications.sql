-- Migration: drop_vendor_applications
-- The self-serve vendor application flow is gone (vendors are now created by
-- an admin via the admin-create-vendor edge function + provision_vendor).
-- Drop the table and its now-unused RPCs. The role guard
-- (prevent_privileged_self_update / app.bypass_role_guard) is kept — it's
-- still used by bootstrap_admin and provision_vendor.

drop function if exists public.approve_vendor_application(uuid, uuid);
drop function if exists public.approve_vendor_application(uuid, uuid, uuid);
drop function if exists public.pending_vendor_application_ids();
drop table if exists public.vendor_applications cascade;
