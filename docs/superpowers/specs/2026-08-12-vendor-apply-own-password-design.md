# Vendor applicants set their own password

## Problem

The current vendor application flow (`vendor-apply.tsx` → `vendor_applications` table →
`approve-vendor-application` Edge Function) has the admin's approval action generate a random
temp password and show it once in an alert, for the admin to relay to the vendor out of band
(phone call, in person — no email infra in this project). That's an extra manual handoff step
and a password neither party chose. Vendors should pick their own password when they apply, and
just use it once approved — no relay of any secret between admin and vendor at all.

## Design

### Data model

`vendor_applications` gets a new column:

```sql
alter table public.vendor_applications
  add column applicant_user_id uuid references public.users(id) on delete set null;
```

`on delete set null` (not `cascade`) — if the applicant's auth account is later deleted (the
reject path, below), the application row survives with `applicant_user_id = null` so it still
shows up in an audit trail, it just no longer points at a live account.

The account is created **at apply time**, not at approval time — inert (no `vendor` role, not
linked to any `vendors` row) until an admin approves it. This is the standard "sign up first, get
approved later" shape (e.g. marketplace seller onboarding). It sidesteps ever storing a password
in a business table waiting to be used — the real GoTrue-managed account exists from the start.

The existing `vendor_applications: public insert` RLS policy is dropped — the client no longer
inserts that table directly (creating a password-login account is an Admin API operation, so it
has to go through a service-role Edge Function regardless; the table insert happens inside that
same function call, using the service-role client, which bypasses RLS entirely).

### `apply-vendor-application` (new Edge Function)

Public — no caller JWT check possible or needed, the applicant has no account yet. Body:
`{ vendor_id, full_name, email, phone, bio, password }`.

1. Re-check `vendors.owner_user_id is null` for `vendor_id` server-side — don't just trust the
   client's possibly-stale dropdown. If it's been claimed since the applicant loaded the form,
   return `{ error, code: 'STALL_UNAVAILABLE' }` before touching auth at all.
2. `adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })`.
   `email_confirm: true` for the same reason `approve-vendor-application` already uses it — no
   SMTP configured in this project. If this fails (email already registered), return
   `{ error, code: 'EMAIL_IN_USE' }`.
3. Insert the `vendor_applications` row with `applicant_user_id` set to the new user's id. If
   this fails — most likely the unique-pending-per-stall index (a race against another applicant
   for the same stall) — **delete the auth user just created** (`adminClient.auth.admin.deleteUser`)
   so nothing orphans, then return `{ error, code: 'STALL_ALREADY_PENDING' }` (or a generic error
   for anything unexpected).

Returns `{ ok: true }` on success — no password to hand back, the applicant already has it.

### `approve-vendor-application` (existing function, simplified)

No longer creates an auth user or generates a password. Verifies caller is `role = 'admin'` (same
as today), then calls the `approve_vendor_application` RPC with just `{ application_id, admin_id }`
— the RPC looks up `applicant_user_id` from the row itself now, rather than trusting an id passed
in by the caller (tighter: eliminates a class of "caller passed a mismatched id" bugs). The RPC's
internal logic (link `vendors.owner_user_id`, flip `role = 'vendor'` via the existing
`app.bypass_role_guard` transaction-scoped trigger bypass, mark the application `approved`) is
otherwise unchanged from what's already deployed.

Success response becomes just `{ ok: true }`.

### `reject-vendor-application` (new Edge Function)

Replaces what was previously a plain client-side `vendor_applications` row update — rejecting now
also has to delete the applicant's now-unwanted auth account, which needs service_role, so it
becomes a function like approve. Verifies caller is `role = 'admin'`. Body:
`{ application_id, reviewer_note? }`.

1. Fetch the application, must be `status = 'pending'` (else `{ error, code: 'APPLICATION_ALREADY_REVIEWED' }`,
   same 409 pattern `approve` already uses).
2. `adminClient.auth.admin.deleteUser(applicant_user_id)` — cascades: the `public.users` row goes
   with it (existing `on delete cascade` from `auth.users`), and `vendor_applications.applicant_user_id`
   auto-nulls (the new `on delete set null` above).
3. `adminClient.from('vendor_applications').update({ status: 'rejected', reviewer_note, reviewed_by: admin_id, reviewed_at: now() })`.

Both steps happen inside the one function call so a mid-way failure (e.g. step 2 succeeds, step 3
never runs because the connection drops) doesn't leave things half-done across two separate round
trips the way a client-driven two-step process would — the application would just stay `pending`
with a dead `applicant_user_id`, and the admin can safely retry reject.

### Client changes

**`vendor-apply.tsx`**:
- Add password + confirm-password `TextInput`s (`secureTextEntry`), client-side validated (min 8
  chars, match) before the submit button enables — same instinct as the existing "must pick a
  stall / fill required fields" `canSubmit` check, just extended.
- Swap `supabase.from('vendor_applications').insert({...})` for
  `supabase.functions.invoke('apply-vendor-application', { body: {...} })`.
- Map the returned `code` to a localized message (see i18n below); fall back to the raw `error`
  string for anything unrecognized.
- Success copy changes from "an admin will review it and be in touch" to something reflecting
  that the account already exists, just inert: "You can log in with this email and password once
  an admin approves your stall claim."

**`(admin)/applications.tsx`**:
- `handleApprove`'s success alert drops the password blob entirely — becomes a plain "Vendor
  approved" / "They can log in with the password they set when applying" message.
- `handleReject` swaps its direct `supabase.from('vendor_applications').update(...)` for
  `supabase.functions.invoke('reject-vendor-application', { body: { application_id, reviewer_note } })`.
  The admin's session token is forwarded automatically by `functions.invoke`, same as approve
  already does today — no manual header wiring needed.

**Nothing changes** in `vendor-login.tsx` — an applicant who tries to log in before approval
already gets bounced (`role !== 'vendor'` check, signs them back out with "not registered as a
vendor"). That safety net already exists and needs no new code.

### i18n

Both Edge Functions return `{ error: string, code: string }` rather than just a message, so the
client can map `code` → a localized (en/th) string instead of showing raw English server text —
consistent with how the rest of this app handles errors, and how `vendor-apply.tsx` already
special-cased the `23505` unique-violation into a translated `duplicateMsg` before this change.

New `vendor.apply.*` keys: `passwordLabel`, `passwordPlaceholder`, `confirmPasswordLabel`,
`passwordMismatchMsg`, `passwordTooShortMsg`, `emailInUseMsg`, `stallUnavailableMsg` (the last
replaces the old generic `duplicateMsg`, which mapped 1:1 to Postgres's `23505` — now there are
two distinct server-detected races to word separately: someone else's *application* landed first
(`STALL_ALREADY_PENDING`, same wording as today's `duplicateMsg`) vs. someone else's *approval*
landed first (`STALL_UNAVAILABLE`, new wording — "This stall was just claimed by someone else").

`admin.applications.approvedMsg` loses its `{password}` placeholder — becomes a plain sentence,
no interpolation needed.

## Migration plan

One new migration file:
- `alter table vendor_applications add column applicant_user_id ...`
- Drop the `vendor_applications: public insert` policy.
- Replace `approve_vendor_application`'s signature/body (drop `p_new_user_id` param, look up
  `applicant_user_id` from the row internally).

## Out of scope

- No password-strength meter or complexity rules beyond min-length — matches this project's
  existing "capstone demo, not production scale" bar (see `CLAUDE.md`).
- No "resend/change password" flow for an applicant who forgot what they set before approval —
  out of scope; they'd need to be rejected and reapply (rare enough at this scale not to build a
  recovery path for it).
- No rate limiting on `apply-vendor-application` despite it being a public, unauthenticated
  account-creation endpoint — the finite unclaimed-stall pool (bounded by the real canteen
  roster) already caps how many accounts it can be used to spray-create.
- No retry/reconciliation if the cleanup delete-user call itself fails after the application-row
  insert already failed (a failure inside a failure) — the account could orphan in that narrow
  window. Rare enough, and cheap enough to fix by hand (dashboard → delete the stray user), not
  worth building automatic reconciliation for at this scale.
