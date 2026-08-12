-- Migration: vendor_apply_google_only
-- Backstops apply-vendor-application's ALREADY_APPLIED pre-check: one
-- pending application per applicant, mirroring the existing one-per-stall
-- index. See docs/superpowers/specs/2026-08-12-vendor-google-only-auth-design.md.

create unique index vendor_applications_one_pending_per_applicant
  on public.vendor_applications (applicant_user_id)
  where status = 'pending';
