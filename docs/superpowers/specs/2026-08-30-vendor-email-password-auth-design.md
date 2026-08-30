# Vendor Email/Password Auth — Design

**Status:** accepted · **Date:** 2026-08-30 · **Supersedes (in part):**
`2026-08-12-vendor-google-only-auth-design.md`

## Problem

Vendor login is Google OAuth only. The team does not control the vendors' Google
accounts, so nobody can sign in as a vendor to test or demo the vendor dashboard
without borrowing a real person's Gmail. The self-serve application flow
(`become-vendor` → `vendor-apply` → `vendor_applications` → admin `approve`) was built
around the applicant's Google identity being the eventual vendor identity.

## Decision

Vendor authentication becomes **email/password**, permanently, for production — not a
test-only shim. Each store gets an account **created by an admin** from the admin
portal; the admin hands the credentials to the vendor. Students remain Google-only.
Admins are unchanged (already `signInWithPassword`, URL-only).

Because the team now provisions vendor accounts, the self-serve application flow is
**removed entirely** — screens, edge functions, the `vendor_applications` table, and
its RPCs.

### Why not keep it test-only

A dev-only seed of email/password vendors would preserve the post-incident Google-only
posture, but the real friction is ongoing (every new stall, every demo), and the
product model already has an admin who vets vendors. Making it the real flow removes a
whole subsystem rather than adding a parallel one.

### Why admin-created, not self-serve with a separate store account

Self-serve would need the applicant to authenticate *somehow* to submit the form, then
a cross-account handoff to a team-created store account at approval time — two account
concepts and a migration step. Admin-created collapses that: one form, one account,
one role flip.

### Consequences

- Reverses `project_vendor_google_only_auth` **for the vendor role only**. Student +
  admin posture unchanged. Memory to be updated after ship.
- `vendor_applications` data is dropped from the live DB (it holds only application
  records; acceptable pre-launch).
- Old installed app builds that call `apply/approve/reject-vendor-application` will get
  404/500 after the drop.
- A store "email" is an identifier, not necessarily a real inbox
  (`stall@eatzy.app`-style), so no email-verification or password-reset dependency:
  accounts are created `email_confirm: true`, and "Forgot Password?" is a
  contact-the-admin stub.

## Screen: `/vendor-login`

Mobile adaptation of Figma node `1:959` "Vendor Login" (a 1280px desktop two-panel
mock — only the left form is used, single-column, Eatzy-branded). Mirrors
`src/app/admin-login.tsx` structure and conventions.

| Element | Behavior |
|---|---|
| Email + password + "Sign In to Dashboard" | `supabase.auth.signInWithPassword` → read `users.role` → `!== 'vendor'` ⇒ `signOut()` + error, else `router.replace('/(vendor)/overview')`. |
| "Forgot Password?" | Presentational stub → `showAlert` "contact your Eatzy admin". |
| "Don't have a vendor account? Apply here." | Presentational stub → same alert. |
| "Remember me for 30 days" | Inert checkbox rendered checked. Sessions already persist via `LargeSecureStore`; the "30 days" copy is decorative. |

Entry point: a visible "Vendor login" link on `(auth)/index.tsx` (replacing the
removed "Become a Vendor" link). `/vendor-login` added to `PUBLIC_ROUTES`.

## Provisioning

`(admin)/new-vendor.tsx` (a new tab replacing `Applications`) collects **store email,
password, business name, cuisine tags** and calls a new admin-gated edge function
`admin-create-vendor`:

1. `adminClient.auth.admin.createUser({ email, password, email_confirm: true })` — the
   `handle_new_user` trigger creates `public.users` (role `student`) synchronously.
2. `rpc('provision_vendor', { p_user_id, p_business_name, p_cuisine_tags })` — new
   `SECURITY DEFINER` function: insert `public.vendors` (`owner_user_id = p_user_id`,
   `is_on_campus` defaulted), then flip `users.role` to `vendor` using the existing
   `app.bypass_role_guard` GUC pattern. Returns the new `vendor_id`.
3. Rollback: `createUser` failure → nothing. RPC `23505` on `vendors_owner_user_id_key`
   (account already owns a store) → 409, **no** `deleteUser`. RPC `user_not_found` →
   one 250 ms retry → else `deleteUser` + 500. Other RPC failure → `deleteUser` + 500.

`provision_vendor` mirrors `approve_vendor_application`
(`supabase/migrations/20260814100000_vendor_apply_basic_info_only.sql`) minus the
application bookkeeping. Execute granted to `service_role` only.

The admin screen echoes the entered email + password once for hand-off; the edge
function never returns the password.

## Rejected alternatives

- **Responsive / desktop-faithful vendor-login** — inconsistent with the mobile-only
  vendor dashboard.
- **Wire a real password-reset flow** — store emails aren't guaranteed real inboxes.
- **Keep `vendor_applications` as an internal admin-filled record** — no consumer left
  once self-serve is gone; pure overhead.
- **Generalise `admin-login` into one `staff-login`** — more branching in a security-
  sensitive screen for no user benefit; vendors get their own route.

## Verification

See the implementation plan (`../plans/2026-08-30-vendor-email-password-auth.md`),
section "Verification".
