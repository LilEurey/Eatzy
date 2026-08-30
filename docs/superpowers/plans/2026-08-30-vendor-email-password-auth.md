# Vendor Email/Password Auth — Implementation Plan

> Design: `../specs/2026-08-30-vendor-email-password-auth-design.md`

**Goal:** Switch vendor auth from Google OAuth to admin-provisioned email/password;
remove the self-serve vendor application flow end to end.

**Ordering rule:** all additive DB / edge / client work lands first; every client +
type reference to the doomed objects is removed **before** the drop migration and
final type regen. No commit ever references a missing table / function / route.

**Environment:** repo is linked to hosted Supabase project `rxrxsgsxbuevclfqwhtu`.
Migrations via `supabase db push` (or Supabase MCP `apply_migration`); types via
`supabase gen types typescript --linked > src/types/database.types.ts`; functions via
`supabase functions deploy|delete`.

**Status (2026-08-30):** Phases 0–7 implemented and committed on
`feat/vendor-email-password-auth`. DB migrations `20260830140105_provision_vendor` and
`20260830142206_drop_vendor_applications` applied to the linked project;
`admin-create-vendor` deployed (v1). `provision_vendor` verified at the DB level
(role flip + `23505` on repeat owner). `npx tsc --noEmit` clean. Outstanding manual
steps: (a) `supabase functions delete apply-vendor-application
approve-vendor-application reject-vendor-application` — CLI not available in the
implementation environment, the three functions are deployed-but-dead until then;
(b) Phase 8 Auth-config check on the dashboard; (c) Phase 9 in-app verification.
`npm run lint` / `eslint` are both broken in this repo's toolchain (dotenv +
ESLint-internal errors) independent of this change — could not run.

## Phase 0 — Branch + baseline
- [x] Feature branch `feat/vendor-email-password-auth` off `main`.
- [ ] Record clean `npx tsc --noEmit` + `npm run lint` baseline.

## Phase 1 — Additive migration
- [ ] `supabase/migrations/20260830000000_provision_vendor.sql`:
      `public.provision_vendor(p_user_id uuid, p_business_name text, p_cuisine_tags text[]) returns uuid`,
      `security definer set search_path = ''`. Insert `public.vendors (name, cuisine_tags, owner_user_id)`
      (let `is_on_campus` default); `perform set_config('app.bypass_role_guard','on',true)`;
      `update public.users set role='vendor' where id = p_user_id`; `raise 'user_not_found'` if `not found`;
      `return v_vendor_id`. `revoke execute ... from public, anon, authenticated`; `grant execute ... to service_role`.
      Pattern: `20260814100000_vendor_apply_basic_info_only.sql:11-59`.
- [ ] `supabase db push`.
- [ ] Regenerate `src/types/database.types.ts` (interim).

## Phase 2 — Edge function `admin-create-vendor`
- [ ] `supabase/functions/admin-create-vendor/index.ts`, modeled on
      `approve-vendor-application/index.ts` + `bootstrap-admin/index.ts`.
      - Admin gate: `Authorization` header → `callerClient.auth.getUser()` →
        `adminClient` checks `users.role === 'admin'` → 403 otherwise.
      - Body `email, password, business_name, cuisine_tags`. Validate presence + min
        password length; normalize `cuisine_tags` → `string[]`.
      - `adminClient.auth.admin.createUser({ email, password, email_confirm: true })`.
      - `adminClient.rpc('provision_vendor', { p_user_id: created.user.id, p_business_name, p_cuisine_tags })`.
      - Rollback: `createUser` fail → return message. RPC `code === '23505'` → 409
        "This account already has a store", **no** `deleteUser`. RPC `user_not_found`
        → 250 ms retry → else `deleteUser` + 500. Other → `deleteUser` + 500.
      - Return `{ ok: true, user_id }` only. Errors as JSON `{ error, code? }` with a
        non-2xx status (for `invokeEdgeFunction()`).
- [ ] `supabase functions deploy admin-create-vendor`.

## Phase 3 — Additive client
- [ ] `src/lib/i18n/en.ts` **and** `th.ts`, key-parallel in one commit: add
      `vendor.login.*` (`heading, subtitle, emailLabel, emailPlaceholder,
      passwordLabel, signIn, signingIn, forgotPassword, rememberMe, applyFooter,
      contactAdminTitle, contactAdminMsg, back`), `admin.nav.newVendor`,
      `admin.newVendor.*` (`title, subtitle, emailLabel, passwordLabel,
      businessNameLabel, cuisineTagsLabel, cuisineTagsHint, submit, submitting,
      successTitle, successMsg, credentialsNote, errorTitle`), `auth.vendorLoginCta`.
      Do not touch existing `vendor.login.brand` / `vendor.portalLabel`.
- [ ] `src/app/vendor-login.tsx` — new standalone route mirroring `admin-login.tsx`
      (own `SafeAreaView` + `KeyboardAvoidingView` + `ScrollView`, `maxWidth: 380`
      column, `Brand` tokens, `useI18n`, `Tap`, `Ionicons`). `Brand.vendorAccent` for
      brand row/icons; **primary button `Brand.orange`** + trailing `arrow-forward`.
      Logic per `admin-login.tsx:18-35` (role must be `vendor`). "Forgot Password?" /
      "Apply here" → `showAlert(t('vendor.login.contactAdminTitle'), t('vendor.login.contactAdminMsg'))`.
      "Remember me" = `View` + `Ionicons` `checkbox`, no state. `← Back` per
      `admin-login.tsx:114-119`. **Do not touch `src/lib/supabase.ts`.**
- [ ] `src/app/(admin)/new-vendor.tsx` — new file, bare `<View>` (layout provides
      `SafeAreaView` + `ScrollView`), shape like the old `applications.tsx`. Fields:
      store email, password, business name, cuisine tags (comma-split `TextInput`).
      Submit → `invokeEdgeFunction('admin-create-vendor', { body })`. On success swap
      form for a one-time credentials panel (`t('admin.newVendor.credentialsNote')`);
      keep password in local state only. Errors → `showAlert`.
- [ ] `src/app/_layout.tsx` — add `'/vendor-login'` to `PUBLIC_ROUTES` verbatim
      (leading slash, no trailing slash, no group segment). Leave `/become-vendor`.
- [ ] `src/app/(auth)/index.tsx` — add "Vendor login" `Tap` →
      `router.push('/vendor-login')` (`t('auth.vendorLoginCta')`). Leave "Become a
      vendor" link for now.
- [ ] Typecheck. Both flows coexist.

## Phase 4 — Swap admin landing route
- [ ] `src/app/(admin)/_layout.tsx` — replace the Applications `NavTab` (~67-71) with
      a New vendor tab: `label={t('admin.nav.newVendor')}`,
      `active={pathname === '/new-vendor'}`, `onPress={() => router.push('/(admin)/new-vendor')}`.
- [ ] `src/app/admin-login.tsx:30` — `/(admin)/applications` → `/(admin)/new-vendor`.
- [ ] `src/app/_layout.tsx` `routeAfterAuth` admin branch (~74) — same repoint.
- [ ] Typecheck + smoke: admin login lands on New vendor tab.

## Phase 5 — Remove self-serve flow (client)
- [ ] `src/hooks/useGoogleSignIn.ts` — drop `vendorIntent` param, the
      `setVendorIntent`/`clearVendorIntent` import + both call sites; `signIn()` no-arg.
- [ ] `src/app/(auth)/index.tsx` — `signIn(false)` → `signIn`; delete "Become a
      vendor" `Tap` (~157).
- [ ] `src/app/(tabs)/profile.tsx` — delete the `/vendor-apply` row (~361-367).
- [ ] `src/app/_layout.tsx` — remove `consumeVendorIntent` import, `hadVendorIntent`
      line, the `/vendor-apply` redirect branch; drop `/become-vendor` from
      `PUBLIC_ROUTES`. Keep `router.canDismiss()/dismissAll()` and the rest.
- [ ] Delete `src/app/become-vendor.tsx`, `src/app/vendor-apply.tsx`,
      `src/lib/vendor-intent.ts`, `src/app/(admin)/applications.tsx`.
- [ ] Delete `supabase/functions/{apply,approve,reject}-vendor-application/`.
- [ ] `grep -rn "vendor-apply\|become-vendor\|vendor-intent\|vendorIntent\|consumeVendorIntent" src/` → zero.
- [ ] Typecheck + lint.

## Phase 6 — i18n cleanup
- [ ] Remove dead keys from **both** locale files, key-parallel: `vendor.apply.*`,
      `vendor.pitch.*`, `admin.applications.*`, `admin.nav.applications`,
      `auth.becomeVendorCta`, `profile.applyVendor`, and `auth.vendorSignupMsg` if
      unused. Keep `admin.login.*`, `vendor.login.brand`, `vendor.portalLabel`,
      `admin.nav.vendors`, `admin.vendors.*`.
- [ ] `grep -rn "admin.applications\|vendor.apply\|vendor.pitch\|becomeVendorCta\|profile.applyVendor" src/` → zero.
- [ ] Typecheck.

## Phase 7 — Destructive migration + final type regen
- [ ] `supabase/migrations/20260830000100_drop_vendor_applications.sql`:
      `drop function if exists public.approve_vendor_application(uuid, uuid);`
      `drop function if exists public.approve_vendor_application(uuid, uuid, uuid);`
      `drop function if exists public.pending_vendor_application_ids();`
      `drop table if exists public.vendor_applications cascade;`
      Do **not** touch `prevent_privileged_self_update` / `app.bypass_role_guard`.
- [ ] `supabase db push`.
- [ ] `supabase functions delete apply-vendor-application approve-vendor-application reject-vendor-application`.
- [ ] Regenerate `src/types/database.types.ts` (final).
- [ ] `npx tsc --noEmit` + `npm run lint` → clean.

## Phase 8 — Auth config (hosted dashboard, manual)
- [ ] Note the project's password min length / leaked-password protection; mirror the
      min in the edge function. `email_confirm: true` already makes login independent
      of the confirmation setting.

## Phase 9 — Verify + ship
- [ ] Run Verification below.
- [ ] Commit per phase; open PR.
- [ ] Update memory `project_vendor_google_only_auth` (vendor-role carve-out).

---

## Verification (against the linked project; admin account must exist)

**A. Create a vendor via admin UI**
1. `/admin-login` as admin → lands on **New vendor** tab.
2. Submit email `stall01@example.com`, password `Str0ngPass!23`, business
   `Som Tam Corner`, tags `Thai, Som Tam, Rice`.
3. Success panel shows email + password once + hand-off note.
4. SQL: `users.role` = `vendor`; `vendors` row with that `owner_user_id`, `name`,
   `cuisine_tags`, `is_on_campus=true`, `is_open=false`; `auth.users.email_confirmed_at` set.
5. Re-submit same email → 409 "account already has a store"; `vendors`/`auth.users`
   counts unchanged (no rollback).
6. 3-char password → edge-function error surfaced; no `auth.users` row.

**B. Log in as the new vendor**
7. Sign out. `/vendor-login` via the `(auth)/index.tsx` link **and** a signed-out deep
   link (validates `PUBLIC_ROUTES`).
8. Sign in → `router.replace('/(vendor)/overview')`, dashboard renders "Som Tam Corner"
   (not the spinner that bounces to `/(auth)`) — proves `initVendorSession()`
   (`src/lib/vendor-store.ts:189-228`) returned `'ok'`.
9. Sign in with **admin** creds on `/vendor-login` → `signOut()` + "not registered as
   a vendor", stays put.
10. Kill + relaunch with vendor session → resumes at `/(vendor)/overview`.
11. Vendor "Log Out" → `/(auth)`.

**C. Removed flows gone**
12. `(auth)/index.tsx` shows "Vendor login", not "Become a Vendor".
13. Google student login still routes to `/(tabs)` / `/(auth)/onboarding`, no
    `vendor-apply` detour; `signIn()` runs with no arg.
14. `(tabs)/profile.tsx` has no "apply to open a store" row.
15. Signed-out deep link to `/become-vendor` / `/vendor-apply` → `/(auth)`.
16. Admin nav = **New vendor** + **Vendors** only.
17. `curl .../functions/v1/approve-vendor-application` → 404.
18. `select to_regclass('public.vendor_applications')` → null; `approve_vendor_application`
    / `pending_vendor_application_ids` gone from `pg_proc`; `provision_vendor` present.
19. `grep -rn "vendor_applications\|approve_vendor_application\|pending_vendor_application_ids\|vendor-apply\|become-vendor\|vendor-intent\|vendorIntent" src/` → zero.
    `npx tsc --noEmit` + `npm run lint` → clean.

**D. Regression**
20. Admin "Vendors" tab lists "Som Tam Corner" with its owner.
21. Student orders at it; vendor accepts/ready/hands off (exercises `orders` /
    `menu_items` owner RLS keyed on `vendors.owner_user_id`).
22. Pre-existing seeded vendors still log in and load.

## Risks (see design doc for detail)

`vendors` has no INSERT RLS policy — `provision_vendor` as `SECURITY DEFINER` bypasses
it, do **not** add one · `vendors_owner_user_id_key` (one stall per owner) → `23505`
handled as 409 without rollback · role-guard GUC must be set before the `role` update ·
`handle_new_user` runs synchronously in the signup txn (250 ms retry is defensive
only) · `deleteUser` cascades to `public.users` · regen `database.types.ts` only at
Phase 1 and Phase 7 · remove `admin.nav.applications` only after the Phase 4 tab swap ·
both locale files must move together · no checkbox primitive exists (hand-rolled) ·
old installed builds calling the deleted functions will 404/500 post-Phase 7.
