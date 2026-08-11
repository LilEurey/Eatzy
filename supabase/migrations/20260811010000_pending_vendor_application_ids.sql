-- Migration: pending_vendor_application_ids
-- vendor-apply.tsx needs to exclude stalls with a pending application from
-- its dropdown, but anon has no SELECT on vendor_applications (it holds
-- applicant PII, admin-only per the table's RLS) — that query always came
-- back empty, so the filter silently did nothing. Expose just the vendor_id
-- column via a SECURITY DEFINER function instead of widening the table's
-- own RLS, which would leak applicant name/email/phone to anon.

create or replace function public.pending_vendor_application_ids()
returns table (vendor_id uuid)
language sql
security definer
stable
set search_path = ''
as $$
  select v.vendor_id from public.vendor_applications v where v.status = 'pending';
$$;

grant execute on function public.pending_vendor_application_ids() to anon, authenticated;
