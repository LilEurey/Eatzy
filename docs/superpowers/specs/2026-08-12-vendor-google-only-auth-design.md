# Vendor auth moves to Google-only (no more password login)

## Problem

The app currently has two separate authentication systems: students sign in with Google
(`(auth)/index.tsx`), while vendors sign in with an email/password created at apply time
(`vendor-login.tsx`, `vendor-apply.tsx`). Running two systems doubles the auth surface, requires a
never-built "forgot password" flow, and already produced a real incident this session — a vendor's
password ended up hardcoded in source as a dev-login shortcut. Vendors should use the exact same
Google button students already use. Applying to open a store becomes something a signed-in user
does from inside the app, not a separate signup form that creates a new account.

## Design

### Auth & entry point

`(auth)/index.tsx` (the existing Google OAuth screen) becomes the only sign-in screen in the app,
for students and vendors alike. `vendor-login.tsx` is deleted outright. The "Vendor? click here"
link on the login screen (which pointed at `/vendor-login`) is removed — there's no separate vendor
entry point anymore, just the one Google button.

Root layout routing (`_layout.tsx`) needs no changes: `routeAfterAuth` already branches on
`role` (`student` → tabs, `vendor` → `/(vendor)/overview`, `admin` → `/(admin)/applications`), and a
newly-Google-signed-in user already lands as `student` by default via the existing profile-creation
path. Admin keeps its separate, unlinked, password-based `/admin-login` — out of scope for this
change (see Out of scope).

### Apply flow moves behind login

`/vendor-apply` stops being a public pre-login page and becomes a normal authenticated route: it's
removed from `_layout.tsx`'s `PUBLIC_ROUTES` list (which becomes just `['/admin-login']`), so an
unauthenticated visit now bounces to `(auth)` the same way any other protected route already does —
no new redirect logic needed, just removing the allowlist entry.

The entry point becomes a new row in the student profile screen (`(tabs)/profile.tsx`), in the
"Account settings links" card, alongside Account Details / Language / Notifications / Help: **"Apply
to open a store"**, routing to `/vendor-apply`. No role check needed before showing it — only
students ever reach this screen (vendor/admin accounts get routed elsewhere by the root layout), so
whoever's on this screen is eligible to apply.

### `vendor-apply.tsx` — form gets smaller

Password + confirm-password fields are removed entirely, along with the email field — the
applicant is already signed in, so their email comes from their session, not a text input.
Full name, phone, bio, and the unclaimed-stall picker are unchanged. The submitted body shrinks to
`{ vendor_id, full_name, phone, bio }` — no `email`, no `password`. The Edge Function derives the
applicant's email from their verified JWT rather than trusting whatever a client might type, which
is also just more correct than the current design.

Success copy changes from "You can log in with this email and password once an admin approves your
stall claim" to "An admin will review your application. You'll get vendor access on this account
once it's approved" — there's no separate credential to mention anymore, it's the same account they
already use.

`vendor.apply.backToLogin` ("← Back to vendor login") becomes "← Back" — `router.back()` now returns
to wherever they came from inside the app (typically profile), not to a login screen.

### `apply-vendor-application` Edge Function — rewritten, and smaller than today's

Today this function creates a brand-new auth account via the Admin API, which means it also has to
handle password validation, `EMAIL_IN_USE`, and deleting the just-created account if the following
DB insert fails. None of that exists anymore, because the applicant already has a real account
before they ever call this function.

New shape — authenticated (JWT-gated), same caller-verification pattern already used by
`approve-vendor-application` and `reject-vendor-application` (a `callerClient` built from the
incoming `Authorization` header, `callerClient.auth.getUser()` to identify them, then a role check
via the service-role `adminClient`):

1. Verify caller has a valid session (401 `Invalid session` if not — same as approve/reject today).
2. Look up caller's `role` in `public.users`. If it isn't `'student'`, return
   `{ error, code: 'NOT_STUDENT' }` (409) — blocks a vendor or admin account from filing a second
   application through this path.
3. Validate `vendor_id`, `full_name`, `phone` are present (`bio` stays optional) — `{ error, code:
   'MISSING_FIELDS' }` (400) otherwise. No `password` field to validate anymore.
4. Pre-check: does the caller already have a `status = 'pending'` row in `vendor_applications`? If
   so, `{ error, code: 'ALREADY_APPLIED' }` (409) — friendlier than waiting for the new unique-index
   violation below to catch it.
5. Re-check `vendors.owner_user_id is null` for `vendor_id` server-side (unchanged from today) —
   `{ error, code: 'STALL_UNAVAILABLE' }` (409) if it's been claimed since the applicant loaded the
   form.
6. Insert the `vendor_applications` row via `adminClient` (service role — RLS on this table only
   allows admin read/update, no client insert path, same as today) with `applicant_user_id =
   caller.id` and `email = caller.email`. Two unique indexes can now fire a `23505` here — the
   pre-existing `vendor_applications_one_pending_per_vendor` (someone else's application for the
   same stall landed first) and the new `vendor_applications_one_pending_per_applicant` (this
   caller's own concurrent double-submit slipped past the step-4 pre-check). Check
   `insertError.message` for which index name it names — Postgres includes the constraint name in
   the error text — and map `..._per_vendor` → `{ error, code: 'STALL_ALREADY_PENDING' }` (409),
   `..._per_applicant` → `{ error, code: 'ALREADY_APPLIED' }` (409). No auth-user cleanup step needed
   either way, since nothing was created in this call. Anything else unexpected falls back to
   `{ error, code: 'INSERT_FAILED' }` (500).

Returns `{ ok: true }` on success.

### `approve-vendor-application` — unchanged

Already JWT-gated, already calls `approve_vendor_application(p_application_id, p_admin_id)`, which
already looks up `applicant_user_id` from the row itself. Nothing here assumed the account was
created at apply time in a way that needs to change. No code changes to this function or the SQL RPC
it calls.

### `reject-vendor-application` — one step removed, and it matters

Today's version deletes the applicant's auth account on rejection
(`adminClient.auth.admin.deleteUser(application.applicant_user_id)`), because under the
password-based design that account only ever existed *for* the application — orphaned if rejected.

That assumption is now false. Under Google-only auth, the applicant is a real person's ordinary
account that they use for the rest of the app (browsing, ordering) — it exists independently of
whether their vendor application is approved. **The delete-user step must be removed.** Rejecting a
vendor application should only ever change that application's `status`, never touch the applicant's
account. The rewritten function:

1. Verify caller is admin (unchanged).
2. Fetch the application, must be `status = 'pending'` (else `{ error, code:
   'APPLICATION_ALREADY_REVIEWED' }`, unchanged).
3. Update it to `status = 'rejected'`, with `reviewer_note` / `reviewed_by` / `reviewed_at`
   (unchanged) — and stop there. No `deleteUser` call.

### Data model

No table or column changes to `vendor_applications` — `applicant_user_id` stays nullable (the
`on delete set null` behavior it already has is fine to keep even though the reject path no longer
triggers it; it's still correct if an account is ever deleted some other way, e.g. by hand in the
dashboard).

One new migration adds a second partial unique index, mirroring the existing per-stall one:

```sql
create unique index vendor_applications_one_pending_per_applicant
  on public.vendor_applications (applicant_user_id)
  where status = 'pending';
```

This is the DB-level backstop behind the Edge Function's `ALREADY_APPLIED` pre-check (step 4 above)
— closes the race if two requests from the same applicant land concurrently. Not something you
asked for directly, but it falls out naturally once applications are tied to a persistent identity
instead of a throwaway one, and costs nothing to add now.

### Existing vendor account cleanup

`manager@maleethai.eatzy.app` (the one real approved vendor, from earlier manual testing this
session) gets freed the same way the two test stalls were freed in
`20260812010000_free_test_claimed_stalls.sql` — `owner_user_id` and `role` reset back to
unclaimed/student, in the same migration that adds the new index above. This is a deliberate task in
the implementation plan, not something that happens silently — whoever runs that stall re-applies
through the new Google-based flow once it ships.

### i18n

Removed (form fields no longer exist): `vendor.apply.passwordLabel`, `passwordPlaceholder`,
`confirmPasswordLabel`, `confirmPasswordPlaceholder`, `passwordMismatchMsg`, `passwordTooShortMsg`,
`emailLabel`, `emailInUseMsg`.

Removed (whole screen deleted), except `vendor.login.brand` which `(vendor)/_layout.tsx` also
uses for its topbar and stays: `vendor.login.brandSubtitle`, `heading`, `subtitle`, `emailLabel`,
`emailPlaceholder`, `passwordLabel`, `forgotPassword`, `rememberMe`, `signIn`, `signingIn`,
`noAccount`, `applyHere`, `heroHeadline`.

Removed (no separate vendor login screen to link to): `auth.forVendor`, `auth.clickHere`.

Added: `vendor.apply.notStudentMsg` ("This account can't apply for a vendor stall."),
`vendor.apply.alreadyAppliedMsg` ("You already have a pending application."),
`profile.applyVendor` ("Apply to open a store").

Changed: `vendor.apply.submittedMsg` (drop the email/password mention), `vendor.apply.backToLogin`
(→ "← Back").

Both en.ts and th.ts get all of the above kept in sync, same as every prior i18n change this
session.

## Migration plan

One new migration file:
- `create unique index vendor_applications_one_pending_per_applicant ...`
- The `manager@maleethai.eatzy.app` stall-freeing `do $$ ... $$` block (same
  `set_config('app.bypass_role_guard', 'on', true)` pattern as the prior cleanup migration).

No changes to `approve_vendor_application` or any other existing SQL function.

## Out of scope

- Admin auth stays password-based, unchanged, still URL-only and unlinked from the UI — admin
  accounts are hand-provisioned and few, this isn't a self-serve surface the way vendor/student
  accounts are.
- Linking Google as an additional sign-in method to the existing password-based
  `manager@maleethai.eatzy.app` account — that account is freed/reset instead (see above), not
  migrated in place.
- Letting one identity hold both `student` and `vendor` roles simultaneously — approval still flips
  `role` on the same row, one-way, exactly like today. A user who becomes a vendor stops being able
  to use the student side of the app on that account.
- Any guard against someone re-applying immediately after rejection — same as today, no cooldown or
  rate limit; the new per-applicant pending-index only blocks concurrent applications, not
  sequential ones.
- Prefilling `full_name` from the Google profile's display name — the field stays a manual text
  input, same as today, just to avoid adding a data-shape dependency on whatever Google happens to
  return for a given account.
