# Vendor Apply Own Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendor applicants set their own password on the apply form; the admin approval step no longer generates or relays a temp password.

**Architecture:** The applicant's real Supabase Auth account is created at apply time (inert — no `vendor` role, not linked to any stall) by a new public `apply-vendor-application` Edge Function, instead of at approval time. `approve-vendor-application` shrinks to just linking + role-flipping an account that already exists. `reject-vendor-application` becomes a new Edge Function (previously a plain client update) because rejecting now also has to delete the unwanted account.

**Tech Stack:** Supabase Postgres (migrations, RLS, `plpgsql` RPC), Supabase Edge Functions (Deno, `jsr:@supabase/supabase-js@2`), Expo Router / React Native (TypeScript, NativeWind-adjacent inline styles), project's existing `en`/`th` i18n system.

## Global Constraints

- Spec of record: `docs/superpowers/specs/2026-08-12-vendor-apply-own-password-design.md` — every task below implements a specific section of it.
- Password minimum: 8 characters, enforced client-side and in the Edge Function (spec: "Out of scope" rules out anything fancier).
- No SMTP configured in this project — every `createUser` call uses `email_confirm: true`, matching the existing `approve-vendor-application` function.
- This repo has **no automated test framework** (`package.json` has no `jest`/`vitest`, no `test` script). "Run the test" steps below substitute the two things this project already relies on for correctness: `npx tsc --noEmit` (must be clean before every commit, per `CLAUDE.md`) and manual `curl` verification against the linked Supabase project (`rxrxsgsxbuevclfqwhtu`) — the same method already used earlier in this project's session to verify the original apply/approve flow.
- Commit after every task, conventional commit format (`feat(vendor): ...`, `fix(vendor): ...`), per `CLAUDE.md`'s git workflow. Stage specific files, never `git add -A`.
- Project root for all commands: `/Users/pochvasin/Documents/Eatzy`. Supabase project ref: `rxrxsgsxbuevclfqwhtu`. Function deploys use `--use-api` (no local Docker): `npx supabase functions deploy <name> --project-ref rxrxsgsxbuevclfqwhtu --use-api`.
- `.env.local` (git-ignored, already present) holds `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` — every curl verification below starts with `set -a; source .env.local; set +a` to load them.

---

### Task 1: Migration — `applicant_user_id` column, drop public-insert policy, new `approve_vendor_application` signature

**Files:**
- Create: `supabase/migrations/20260812000000_vendor_apply_own_password.sql`

**Interfaces:**
- Produces: `public.vendor_applications.applicant_user_id` (nullable `uuid`, FK to `public.users(id) on delete set null`). `public.approve_vendor_application(p_application_id uuid, p_admin_id uuid)` (replaces the old 3-arg `(p_application_id, p_new_user_id, p_admin_id)` signature — old one is dropped, not just shadowed).

- [ ] **Step 1: Write the migration file**

```sql
-- Migration: vendor_apply_own_password
-- Vendors now set their own password at apply time (apply-vendor-application
-- Edge Function creates their auth account immediately, inert until
-- approved) instead of admin approval generating and relaying a temp
-- password. See docs/superpowers/specs/2026-08-12-vendor-apply-own-password-design.md.

alter table public.vendor_applications
  add column applicant_user_id uuid references public.users(id) on delete set null;

-- The client no longer inserts this table directly — apply-vendor-application
-- does it (service_role, after creating the auth account), since creating a
-- password-login account is an Admin API operation that can't run from a
-- plain anon client insert.
drop policy if exists "vendor_applications: public insert" on public.vendor_applications;

-- Signature changes (drops p_new_user_id — the applicant's account already
-- exists by approval time now, so the RPC looks it up from the row itself
-- instead of trusting an id passed in by the caller).
drop function if exists public.approve_vendor_application(uuid, uuid, uuid);

create or replace function public.approve_vendor_application(
  p_application_id uuid,
  p_admin_id       uuid
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid;
  v_applicant_user_id uuid;
begin
  select vendor_id, applicant_user_id into v_vendor_id, v_applicant_user_id
    from public.vendor_applications
   where id = p_application_id
     and status = 'pending'
   for update;

  if not found then
    raise exception 'application_not_found_or_already_reviewed';
  end if;

  if v_applicant_user_id is null then
    raise exception 'application_missing_applicant';
  end if;

  update public.vendors
     set owner_user_id = v_applicant_user_id
   where id = v_vendor_id
     and owner_user_id is null;

  if not found then
    raise exception 'stall_already_claimed';
  end if;

  perform set_config('app.bypass_role_guard', 'on', true);
  update public.users set role = 'vendor' where id = v_applicant_user_id;

  update public.vendor_applications
     set status = 'approved', reviewed_by = p_admin_id, reviewed_at = now()
   where id = p_application_id;
end;
$$;

revoke execute on function public.approve_vendor_application(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_vendor_application(uuid, uuid) to service_role;
```

- [ ] **Step 2: Push the migration**

Run: `npx supabase db push --linked --yes`
Expected: output lists `20260812000000_vendor_apply_own_password.sql` as applied, no errors.

- [ ] **Step 3: Verify the anon insert policy is actually gone**

```bash
set -a; source .env.local; set +a
curl -s -i -X POST "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/vendor_applications" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"vendor_id":"83e535a5-2163-4ac8-831b-4cc6713b8fe7","full_name":"x","email":"x@example.com","phone":"0800000000"}'
```
Expected: `42501` — "new row violates row-level security policy" (this table now has no anon-insert path at all — only the service-role Edge Function from Task 3 can write to it).

- [ ] **Step 4: Note on leftover test data (no code change)**

If a stray row exists from earlier manual testing (`full_name = 'Test Applicant'`, `email = 'test.applicant@example.com'`), it has `applicant_user_id = null`. It doesn't need cleanup for this migration to be correct — Task 5's `reject-vendor-application` function handles a null `applicant_user_id` gracefully (skips the delete-user step) — but it can be rejected via the admin panel once Task 8 is done, to clear it out of the pending list.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260812000000_vendor_apply_own_password.sql
git commit -m "$(cat <<'EOF'
feat(vendor): applicant_user_id column + new approve_vendor_application signature

First half of moving password ownership to the applicant (see spec
docs/superpowers/specs/2026-08-12-vendor-apply-own-password-design.md) — the
account now gets created at apply time, so approve_vendor_application looks
up who it's promoting from the row itself instead of trusting a caller-
supplied id.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `database.types.ts` — add `applicant_user_id`

**Files:**
- Modify: `src/types/database.types.ts:511-567` (the `vendor_applications` type block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `applicant_user_id: string | null` available on `Tables<'vendor_applications'>['Row']` for later tasks' TypeScript to type-check against.

- [ ] **Step 1: Add the column to `Row`**

Find (inside the `vendor_applications` block, `Row`):
```typescript
        Row: {
          bio: string | null
          email: string
```
Replace with:
```typescript
        Row: {
          applicant_user_id: string | null
          bio: string | null
          email: string
```

- [ ] **Step 2: Add the column to `Insert`**

Find:
```typescript
        Insert: {
          bio?: string | null
          email: string
```
Replace with:
```typescript
        Insert: {
          applicant_user_id?: string | null
          bio?: string | null
          email: string
```

- [ ] **Step 3: Add the column to `Update`**

Find:
```typescript
        Update: {
          bio?: string | null
          email?: string
```
Replace with:
```typescript
        Update: {
          applicant_user_id?: string | null
          bio?: string | null
          email?: string
```

- [ ] **Step 4: Add the foreign-key relationship**

Find:
```typescript
        Relationships: [
          {
            foreignKeyName: "vendor_applications_reviewed_by_fkey"
```
Replace with:
```typescript
        Relationships: [
          {
            foreignKeyName: "vendor_applications_applicant_user_id_fkey"
            columns: ["applicant_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_applications_reviewed_by_fkey"
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean) — this task alone shouldn't introduce errors since nothing consumes the new field yet.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.types.ts
git commit -m "$(cat <<'EOF'
chore(types): add vendor_applications.applicant_user_id

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `apply-vendor-application` Edge Function (new)

**Files:**
- Create: `supabase/functions/apply-vendor-application/index.ts`

**Interfaces:**
- Consumes: HTTP POST body `{ vendor_id: string, full_name: string, email: string, phone: string, bio?: string | null, password: string }`.
- Produces: `{ ok: true }` on success, or `{ error: string, code: string }` with `code` one of `MISSING_FIELDS | PASSWORD_TOO_WEAK | STALL_UNAVAILABLE | EMAIL_IN_USE | STALL_ALREADY_PENDING | CREATE_FAILED | INSERT_FAILED`. Task 7 (`vendor-apply.tsx`) consumes this exact response shape.

- [ ] **Step 1: Write the function**

```typescript
// Public endpoint: creates the applicant's auth account (with the password
// they chose) and their vendor_applications row, in that order. If the row
// insert fails — most likely someone else's application for the same stall
// landed first — the just-created auth user is deleted so nothing orphans.
//
// Deploy: supabase functions deploy apply-vendor-application

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let body: {
    vendor_id?: string;
    full_name?: string;
    email?: string;
    phone?: string;
    bio?: string | null;
    password?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body', code: 'MISSING_FIELDS' }, 400);
  }

  const { vendor_id, full_name, email, phone, password } = body;
  if (!vendor_id || !full_name || !email || !phone || !password) {
    return json(
      { error: 'vendor_id, full_name, email, phone, and password are required', code: 'MISSING_FIELDS' },
      400,
    );
  }
  if (password.length < 8) {
    return json({ error: 'Password must be at least 8 characters', code: 'PASSWORD_TOO_WEAK' }, 400);
  }

  const { data: vendor } = await adminClient
    .from('vendors')
    .select('id, owner_user_id')
    .eq('id', vendor_id)
    .maybeSingle();
  if (!vendor || vendor.owner_user_id !== null) {
    return json({ error: 'This stall is no longer available', code: 'STALL_UNAVAILABLE' }, 409);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (createError || !created.user) {
    const createErrorMsg = (createError?.message ?? '').toLowerCase();
    const alreadyExists = createErrorMsg.includes('already') && createErrorMsg.includes('registered');
    return json(
      {
        error: alreadyExists ? 'This email is already registered' : (createError?.message ?? 'Could not create account'),
        code: alreadyExists ? 'EMAIL_IN_USE' : 'CREATE_FAILED',
      },
      alreadyExists ? 409 : 500,
    );
  }

  const { error: insertError } = await adminClient.from('vendor_applications').insert({
    vendor_id,
    full_name,
    email,
    phone,
    bio: body.bio || null,
    applicant_user_id: created.user.id,
  });
  if (insertError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    const duplicate = insertError.code === '23505';
    return json(
      {
        error: duplicate ? 'This stall already has a pending application' : insertError.message,
        code: duplicate ? 'STALL_ALREADY_PENDING' : 'INSERT_FAILED',
      },
      duplicate ? 409 : 500,
    );
  }

  return json({ ok: true });
});
```

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy apply-vendor-application --project-ref rxrxsgsxbuevclfqwhtu --use-api`
Expected: JSON response with `"message":"Deployed Functions."`.

- [ ] **Step 3: Verify — happy path**

```bash
set -a; source .env.local; set +a
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/apply-vendor-application" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":"83e535a5-2163-4ac8-831b-4cc6713b8fe7","full_name":"Plan Test Vendor","email":"plan.test.vendor@example.com","phone":"0811111111","password":"testpass123"}'
```
Expected: `{"ok":true}`. (`83e535a5-2163-4ac8-831b-4cc6713b8fe7` is "Mama Noodle House" — one of the seeded unclaimed stalls.)

- [ ] **Step 4: Verify — duplicate pending application rejected**

Run the same command again, same `vendor_id`, but a **different email** (reusing the same email would hit `EMAIL_IN_USE` at the `createUser` step before ever reaching the stall-conflict check — that's a different code path, tested separately in Step 5):
```bash
set -a; source .env.local; set +a
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/apply-vendor-application" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":"83e535a5-2163-4ac8-831b-4cc6713b8fe7","full_name":"Plan Test Vendor 2","email":"plan.test.vendor2@example.com","phone":"0811111112","password":"testpass123"}'
```
Expected: `{"error":"This stall already has a pending application","code":"STALL_ALREADY_PENDING"}`. This also exercises the orphan-cleanup path — a real auth account gets created for `plan.test.vendor2@example.com` and then deleted within the same request, since the row insert is what fails. Confirm the cleanup worked: repeat this exact command a third time — if cleanup had failed and left the account behind, this would now return `EMAIL_IN_USE` instead of `STALL_ALREADY_PENDING`.

- [ ] **Step 5: Verify — email already in use rejected**

```bash
set -a; source .env.local; set +a
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/apply-vendor-application" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":"22c8f74a-1ace-4e51-8354-639824d70b6b","full_name":"Someone Else","email":"plan.test.vendor@example.com","phone":"0822222222","password":"testpass123"}'
```
Expected: `{"error":"This email is already registered","code":"EMAIL_IN_USE"}`. (Confirms the earlier createUser succeeded for real — this is what proves the account from Step 3 actually exists.)

- [ ] **Step 6: Verify — weak password rejected**

```bash
set -a; source .env.local; set +a
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/apply-vendor-application" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":"22c8f74a-1ace-4e51-8354-639824d70b6b","full_name":"Weak Pw","email":"weak.pw@example.com","phone":"0833333333","password":"short"}'
```
Expected: `{"error":"Password must be at least 8 characters","code":"PASSWORD_TOO_WEAK"}`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/apply-vendor-application
git commit -m "$(cat <<'EOF'
feat(vendor): apply-vendor-application Edge Function

Creates the applicant's real auth account at apply time (inert until
approved) instead of capturing a password to use later — see
docs/superpowers/specs/2026-08-12-vendor-apply-own-password-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Simplify `approve-vendor-application` Edge Function

**Files:**
- Modify: `supabase/functions/approve-vendor-application/index.ts` (full-file rewrite — small file, cleaner than patching)

**Interfaces:**
- Consumes: `approve_vendor_application(p_application_id uuid, p_admin_id uuid)` RPC from Task 1.
- Produces: `{ ok: true }` on success, or `{ error: string, code: string }` with `code` one of `APPLICATION_ALREADY_REVIEWED | STALL_UNAVAILABLE | APPROVE_FAILED`. Task 8 (`(admin)/applications.tsx`) consumes this.

- [ ] **Step 1: Replace the file**

```typescript
// Approves a pending vendor_applications row: the applicant's auth account
// already exists (created at apply time, with the password they chose) —
// this just links them to the claimed stall and flips their role, via the
// approve_vendor_application RPC.
//
// Deploy: supabase functions deploy approve-vendor-application

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const callerClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) return json({ error: 'Invalid session' }, 401);

  const { data: callerProfile } = await adminClient
    .from('users')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();
  if (callerProfile?.role !== 'admin') return json({ error: 'Admin access required' }, 403);

  let body: { application_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.application_id) return json({ error: 'application_id is required' }, 400);

  const { error: approveError } = await adminClient.rpc('approve_vendor_application', {
    p_application_id: body.application_id,
    p_admin_id: caller.id,
  });
  if (approveError) {
    const msg = approveError.message;
    const code = msg.includes('application_not_found_or_already_reviewed')
      ? 'APPLICATION_ALREADY_REVIEWED'
      : msg.includes('stall_already_claimed')
        ? 'STALL_UNAVAILABLE'
        : 'APPROVE_FAILED';
    return json({ error: msg, code }, 409);
  }

  return json({ ok: true });
});
```

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy approve-vendor-application --project-ref rxrxsgsxbuevclfqwhtu --use-api`
Expected: `"message":"Deployed Functions."`.

- [ ] **Step 3: Verify — requires an admin JWT**

Log into `http://localhost:8081/admin-login` with the project's admin credentials, then in devtools console:
```js
JSON.parse(localStorage.getItem('sb-rxrxsgsxbuevclfqwhtu-auth-token')).access_token
```
Export the result as `$ADMIN_TOKEN` in your shell, then find the application id created in Task 3 Step 3 (`plan.test.vendor@example.com`, on "Mama Noodle House") — either via the admin panel UI, or:
```bash
set -a; source .env.local; set +a
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/approve-vendor-application" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"application_id":"<the application id>"}'
```
Expected: `{"ok":true}`.

- [ ] **Step 4: Verify — approving it again fails cleanly**

Run the identical curl command again.
Expected: `{"error":"application_not_found_or_already_reviewed","code":"APPLICATION_ALREADY_REVIEWED"}`.

- [ ] **Step 5: Verify — the vendor can log in with the password they chose**

At `http://localhost:8081/vendor-login`, sign in with `plan.test.vendor@example.com` / `testpass123` (the password from Task 3 Step 3). Expected: lands on `/(vendor)/overview` for "Mama Noodle House" — no password relay of any kind happened.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/approve-vendor-application/index.ts
git commit -m "$(cat <<'EOF'
fix(vendor): approve-vendor-application no longer generates a password

The account exists from apply time now (Task 3) — approving just links and
promotes it. Removes the temp-password generation and createUser call
entirely; the admin no longer relays anything to the vendor.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `reject-vendor-application` Edge Function (new)

**Files:**
- Create: `supabase/functions/reject-vendor-application/index.ts`

**Interfaces:**
- Consumes: HTTP POST body `{ application_id: string, reviewer_note?: string }`, admin JWT in `Authorization` header.
- Produces: `{ ok: true }` on success, or `{ error: string, code?: string }`. Task 8 consumes this.

- [ ] **Step 1: Write the function**

```typescript
// Rejects a pending vendor_applications row: deletes the applicant's auth
// account (created at apply time, no longer wanted) and marks the
// application rejected, in one call — so a mid-way failure can't leave the
// application pointing at a deleted account without a rejected status.
//
// Deploy: supabase functions deploy reject-vendor-application

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const callerClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) return json({ error: 'Invalid session' }, 401);

  const { data: callerProfile } = await adminClient
    .from('users')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();
  if (callerProfile?.role !== 'admin') return json({ error: 'Admin access required' }, 403);

  let body: { application_id?: string; reviewer_note?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.application_id) return json({ error: 'application_id is required' }, 400);

  const { data: application, error: fetchError } = await adminClient
    .from('vendor_applications')
    .select('id, status, applicant_user_id')
    .eq('id', body.application_id)
    .maybeSingle();
  if (fetchError || !application) return json({ error: 'Application not found' }, 404);
  if (application.status !== 'pending') {
    return json({ error: 'Application already reviewed', code: 'APPLICATION_ALREADY_REVIEWED' }, 409);
  }

  if (application.applicant_user_id) {
    await adminClient.auth.admin.deleteUser(application.applicant_user_id);
  }

  const { error: updateError } = await adminClient
    .from('vendor_applications')
    .update({
      status: 'rejected',
      reviewer_note: body.reviewer_note?.trim() || null,
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', application.id);
  if (updateError) return json({ error: updateError.message }, 500);

  return json({ ok: true });
});
```

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy reject-vendor-application --project-ref rxrxsgsxbuevclfqwhtu --use-api`
Expected: `"message":"Deployed Functions."`.

- [ ] **Step 3: Verify — reject deletes the account and marks the row**

First create a fresh throwaway application (reuse Step 3's pattern from Task 3, different stall/email):
```bash
set -a; source .env.local; set +a
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/apply-vendor-application" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"vendor_id":"22c8f74a-1ace-4e51-8354-639824d70b6b","full_name":"Reject Test","email":"reject.test@example.com","phone":"0844444444","password":"testpass123"}'
```
Expected: `{"ok":true}`. Get its application id from the admin panel (or Supabase dashboard → Table Editor → `vendor_applications`), then, with `$ADMIN_TOKEN` from Task 4 Step 3 (refresh it if the session expired):
```bash
curl -s -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/reject-vendor-application" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"application_id":"<the application id>","reviewer_note":"Plan test rejection"}'
```
Expected: `{"ok":true}`.

- [ ] **Step 4: Verify — the deleted account can't log in**

At `http://localhost:8081/vendor-login`, try `reject.test@example.com` / `testpass123`.
Expected: sign-in fails (invalid credentials) — the account is really gone, not just unlinked.

- [ ] **Step 5: Verify — rejecting an already-reviewed application fails cleanly**

Run the identical reject curl command from Step 3 again.
Expected: `{"error":"Application not found"}` (status `404` — `.maybeSingle()` still finds the row since it's not deleted, only `applicant_user_id` nulled by the cascade, but note: since the row *does* still exist with `status: 'rejected'`, re-run against a *fresh* still-pending application if you want to specifically exercise the `APPLICATION_ALREADY_REVIEWED` code path, or just confirm re-running against the same id here doesn't 500 or double-delete anything — a 404 or a 409 are both acceptable "already handled" outcomes; a `200` would be the actual bug to watch for).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/reject-vendor-application
git commit -m "$(cat <<'EOF'
feat(vendor): reject-vendor-application Edge Function

Reject now also has to delete the applicant's auth account (it exists from
apply time — see Task 3), which needs service_role, so this moves from a
plain client-side row update to its own function, matching approve's shape.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: i18n — new/changed keys in `en.ts` and `th.ts`

**Files:**
- Modify: `src/lib/i18n/en.ts:359-375` (`vendor.apply.*` block) and `:413` (`admin.applications.approvedMsg`)
- Modify: `src/lib/i18n/th.ts` (matching `vendor.apply.*` block and `admin.applications.approvedMsg`)

**Interfaces:**
- Produces: `TranslationKey` (derived from `en.ts`'s keys via `keyof typeof en`) gains `vendor.apply.passwordLabel`, `passwordPlaceholder`, `confirmPasswordLabel`, `confirmPasswordPlaceholder`, `passwordMismatchMsg`, `passwordTooShortMsg`, `emailInUseMsg`, `stallAlreadyPendingMsg`, `stallUnavailableMsg`; loses `vendor.apply.duplicateMsg`. Task 7 consumes these exact key names.

- [ ] **Step 1: Update `en.ts`'s `vendor.apply.*` block**

Find:
```typescript
  'vendor.apply.title': 'Apply for a Vendor Account',
  'vendor.apply.subtitle': 'Claim your stall and an admin will review your application.',
  'vendor.apply.stallLabel': 'Your Stall',
  'vendor.apply.stallPlaceholder': 'Select your stall…',
  'vendor.apply.noStalls': 'No unclaimed stalls right now — check with the canteen office.',
  'vendor.apply.fullNameLabel': 'Full Name',
  'vendor.apply.emailLabel': 'Email Address',
  'vendor.apply.phoneLabel': 'Phone Number',
  'vendor.apply.bioLabel': 'About Your Stall (optional)',
  'vendor.apply.bioPlaceholder': 'What do you serve?',
  'vendor.apply.submit': 'Submit Application',
  'vendor.apply.submitting': 'Submitting…',
  'vendor.apply.submittedTitle': 'Application submitted',
  'vendor.apply.submittedMsg': 'An admin will review it and be in touch.',
  'vendor.apply.errorTitle': 'Couldn’t submit application',
  'vendor.apply.duplicateMsg': 'This stall already has a pending application.',
  'vendor.apply.backToLogin': '← Back to vendor login',
```

Replace with:
```typescript
  'vendor.apply.title': 'Apply for a Vendor Account',
  'vendor.apply.subtitle': 'Claim your stall and an admin will review your application.',
  'vendor.apply.stallLabel': 'Your Stall',
  'vendor.apply.stallPlaceholder': 'Select your stall…',
  'vendor.apply.noStalls': 'No unclaimed stalls right now — check with the canteen office.',
  'vendor.apply.fullNameLabel': 'Full Name',
  'vendor.apply.emailLabel': 'Email Address',
  'vendor.apply.phoneLabel': 'Phone Number',
  'vendor.apply.passwordLabel': 'Password',
  'vendor.apply.passwordPlaceholder': 'At least 8 characters',
  'vendor.apply.confirmPasswordLabel': 'Confirm Password',
  'vendor.apply.confirmPasswordPlaceholder': 'Re-enter your password',
  'vendor.apply.bioLabel': 'About Your Stall (optional)',
  'vendor.apply.bioPlaceholder': 'What do you serve?',
  'vendor.apply.submit': 'Submit Application',
  'vendor.apply.submitting': 'Submitting…',
  'vendor.apply.submittedTitle': 'Application submitted',
  'vendor.apply.submittedMsg': 'You can log in with this email and password once an admin approves your stall claim.',
  'vendor.apply.errorTitle': 'Couldn’t submit application',
  'vendor.apply.passwordMismatchMsg': 'Passwords don’t match.',
  'vendor.apply.passwordTooShortMsg': 'Password must be at least 8 characters.',
  'vendor.apply.emailInUseMsg': 'This email is already registered.',
  'vendor.apply.stallAlreadyPendingMsg': 'This stall already has a pending application.',
  'vendor.apply.stallUnavailableMsg': 'This stall was just claimed by someone else.',
  'vendor.apply.backToLogin': '← Back to vendor login',
```

- [ ] **Step 2: Update `en.ts`'s `admin.applications.approvedMsg`**

Find:
```typescript
  'admin.applications.approvedMsg': 'Temp password (relay to vendor, shown once):\n\n{password}',
```
Replace with:
```typescript
  'admin.applications.approvedMsg': 'They can log in with the password they set when applying.',
```

- [ ] **Step 3: Update `th.ts`'s `vendor.apply.*` block**

Find:
```typescript
  'vendor.apply.title': 'สมัครเป็นผู้ขาย',
  'vendor.apply.subtitle': 'เลือกร้านของคุณ แล้วแอดมินจะตรวจสอบใบสมัคร',
  'vendor.apply.stallLabel': 'ร้านของคุณ',
  'vendor.apply.stallPlaceholder': 'เลือกร้านของคุณ…',
  'vendor.apply.noStalls': 'ตอนนี้ไม่มีร้านว่าง — ติดต่อสำนักงานโรงอาหาร',
  'vendor.apply.fullNameLabel': 'ชื่อ-นามสกุล',
  'vendor.apply.emailLabel': 'อีเมล',
  'vendor.apply.phoneLabel': 'เบอร์โทรศัพท์',
  'vendor.apply.bioLabel': 'เกี่ยวกับร้านของคุณ (ไม่บังคับ)',
  'vendor.apply.bioPlaceholder': 'ร้านคุณขายอะไร?',
  'vendor.apply.submit': 'ส่งใบสมัคร',
  'vendor.apply.submitting': 'กำลังส่ง…',
  'vendor.apply.submittedTitle': 'ส่งใบสมัครแล้ว',
  'vendor.apply.submittedMsg': 'แอดมินจะตรวจสอบและติดต่อกลับ',
  'vendor.apply.errorTitle': 'ส่งใบสมัครไม่สำเร็จ',
  'vendor.apply.duplicateMsg': 'ร้านนี้มีใบสมัครที่รอตรวจสอบอยู่แล้ว',
  'vendor.apply.backToLogin': '← กลับไปหน้าเข้าสู่ระบบผู้ขาย',
```

Replace with:
```typescript
  'vendor.apply.title': 'สมัครเป็นผู้ขาย',
  'vendor.apply.subtitle': 'เลือกร้านของคุณ แล้วแอดมินจะตรวจสอบใบสมัคร',
  'vendor.apply.stallLabel': 'ร้านของคุณ',
  'vendor.apply.stallPlaceholder': 'เลือกร้านของคุณ…',
  'vendor.apply.noStalls': 'ตอนนี้ไม่มีร้านว่าง — ติดต่อสำนักงานโรงอาหาร',
  'vendor.apply.fullNameLabel': 'ชื่อ-นามสกุล',
  'vendor.apply.emailLabel': 'อีเมล',
  'vendor.apply.phoneLabel': 'เบอร์โทรศัพท์',
  'vendor.apply.passwordLabel': 'รหัสผ่าน',
  'vendor.apply.passwordPlaceholder': 'อย่างน้อย 8 ตัวอักษร',
  'vendor.apply.confirmPasswordLabel': 'ยืนยันรหัสผ่าน',
  'vendor.apply.confirmPasswordPlaceholder': 'กรอกรหัสผ่านอีกครั้ง',
  'vendor.apply.bioLabel': 'เกี่ยวกับร้านของคุณ (ไม่บังคับ)',
  'vendor.apply.bioPlaceholder': 'ร้านคุณขายอะไร?',
  'vendor.apply.submit': 'ส่งใบสมัคร',
  'vendor.apply.submitting': 'กำลังส่ง…',
  'vendor.apply.submittedTitle': 'ส่งใบสมัครแล้ว',
  'vendor.apply.submittedMsg': 'คุณสามารถเข้าสู่ระบบด้วยอีเมลและรหัสผ่านนี้ได้ทันทีที่แอดมินอนุมัติการขอเป็นเจ้าของร้าน',
  'vendor.apply.errorTitle': 'ส่งใบสมัครไม่สำเร็จ',
  'vendor.apply.passwordMismatchMsg': 'รหัสผ่านไม่ตรงกัน',
  'vendor.apply.passwordTooShortMsg': 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
  'vendor.apply.emailInUseMsg': 'อีเมลนี้ถูกใช้งานแล้ว',
  'vendor.apply.stallAlreadyPendingMsg': 'ร้านนี้มีใบสมัครที่รอตรวจสอบอยู่แล้ว',
  'vendor.apply.stallUnavailableMsg': 'ร้านนี้เพิ่งถูกจับจองโดยผู้อื่น',
  'vendor.apply.backToLogin': '← กลับไปหน้าเข้าสู่ระบบผู้ขาย',
```

- [ ] **Step 4: Update `th.ts`'s `admin.applications.approvedMsg`**

Find:
```typescript
  'admin.applications.approvedMsg': 'รหัสผ่านชั่วคราว (ส่งต่อให้ผู้ขาย แสดงครั้งเดียว):\n\n{password}',
```
Replace with:
```typescript
  'admin.applications.approvedMsg': 'ผู้ขายสามารถเข้าสู่ระบบด้วยรหัสผ่านที่ตั้งไว้ตอนสมัครได้เลย',
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output. (If `duplicateMsg` were removed from only one of `en.ts`/`th.ts`, `th.ts`'s `Record<TranslationKey, string>` annotation would fail to compile here — this step is the actual check that both files stayed in sync.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/en.ts src/lib/i18n/th.ts
git commit -m "$(cat <<'EOF'
feat(vendor): i18n for apply-time password fields and updated approval copy

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `vendor-apply.tsx` — password fields, call the new function

**Files:**
- Modify: `src/app/vendor-apply.tsx` (full-file rewrite)

**Interfaces:**
- Consumes: `apply-vendor-application` Edge Function (Task 3), `vendor.apply.*` i18n keys (Task 6).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Replace the file**

```typescript
import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type UnclaimedStall = { id: string; name: string; stall_number: string | null };

const ERROR_CODE_KEYS: Record<string, TranslationKey> = {
  EMAIL_IN_USE: 'vendor.apply.emailInUseMsg',
  STALL_ALREADY_PENDING: 'vendor.apply.stallAlreadyPendingMsg',
  STALL_UNAVAILABLE: 'vendor.apply.stallUnavailableMsg',
  PASSWORD_TOO_WEAK: 'vendor.apply.passwordTooShortMsg',
};

export default function VendorApplyScreen() {
  const { t } = useI18n();
  const [stalls, setStalls] = useState<UnclaimedStall[]>([]);
  const [stallsLoading, setStallsLoading] = useState(true);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Unclaimed = no owner yet. A stall with a pending application is still
    // technically unclaimed here — the DB's partial unique index is the real
    // gate against double-claims — but showing it would just invite a
    // doomed submit, so also fetch which stalls already have one pending.
    async function loadStalls() {
      const [{ data: vendors }, { data: pending }] = await Promise.all([
        supabase.from('vendors').select('id,name,stall_number').is('owner_user_id', null).order('name'),
        supabase.rpc('pending_vendor_application_ids'),
      ]);
      const pendingIds = new Set((pending ?? []).map(p => p.vendor_id));
      setStalls((vendors ?? []).filter(v => !pendingIds.has(v.id)));
      setStallsLoading(false);
    }
    void loadStalls();
  }, []);

  const canSubmit =
    !!vendorId && !!fullName.trim() && !!email.trim() && !!phone.trim() &&
    password.length >= 8 && password === confirmPassword && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('apply-vendor-application', {
      body: {
        vendor_id: vendorId,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        bio: bio.trim() || null,
        password,
      },
    });
    setSubmitting(false);
    if (error || data?.error) {
      const code = data?.code as string | undefined;
      const messageKey = code ? ERROR_CODE_KEYS[code] : undefined;
      showAlert(t('vendor.apply.errorTitle'), messageKey ? t(messageKey) : (data?.error ?? error?.message ?? 'Unknown error'));
      return;
    }
    showAlert(t('vendor.apply.submittedTitle'), t('vendor.apply.submittedMsg'), () => router.back());
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F5F9' }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <View style={{ maxWidth: 420, width: '100%', alignSelf: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: Brand.textPrimary, marginBottom: 6 }}>
            {t('vendor.apply.title')}
          </Text>
          <Text style={{ fontSize: 14, color: Brand.textSecondary, marginBottom: 28 }}>
            {t('vendor.apply.subtitle')}
          </Text>

          <Field label={t('vendor.apply.stallLabel')}>
            {stallsLoading ? null : stalls.length === 0 ? (
              <Text style={{ fontSize: 13, color: Brand.textSecondary, paddingVertical: 8 }}>
                {t('vendor.apply.noStalls')}
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {stalls.map(s => {
                  const selected = vendorId === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => setVendorId(s.id)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 9, borderRadius: 50,
                        backgroundColor: selected ? Brand.vendorAccent : '#fff',
                        borderWidth: 1.5, borderColor: selected ? Brand.vendorAccent : '#E2E4EC',
                      }}
                    >
                      <Text style={{ color: selected ? '#fff' : Brand.textPrimary, fontWeight: '600', fontSize: 13 }}>
                        {s.name}{s.stall_number ? ` (${s.stall_number})` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Field>

          <Field label={t('vendor.apply.fullNameLabel')}>
            <TextInput value={fullName} onChangeText={setFullName} style={inputStyle} placeholderTextColor="#B0B4BF" />
          </Field>

          <Field label={t('vendor.apply.emailLabel')}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={inputStyle}
              placeholderTextColor="#B0B4BF"
            />
          </Field>

          <Field label={t('vendor.apply.phoneLabel')}>
            <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={inputStyle} placeholderTextColor="#B0B4BF" />
          </Field>

          <Field label={t('vendor.apply.passwordLabel')}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t('vendor.apply.passwordPlaceholder')}
              placeholderTextColor="#B0B4BF"
              secureTextEntry
              style={inputStyle}
            />
          </Field>

          <Field label={t('vendor.apply.confirmPasswordLabel')}>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('vendor.apply.confirmPasswordPlaceholder')}
              placeholderTextColor="#B0B4BF"
              secureTextEntry
              style={inputStyle}
            />
          </Field>

          <Field label={t('vendor.apply.bioLabel')}>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder={t('vendor.apply.bioPlaceholder')}
              placeholderTextColor="#B0B4BF"
              multiline
              numberOfLines={3}
              style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
            />
          </Field>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={{
              backgroundColor: Brand.orange, borderRadius: 50, paddingVertical: 14,
              alignItems: 'center', opacity: canSubmit ? 1 : 0.5, marginTop: 8, marginBottom: 16,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              {submitting ? t('vendor.apply.submitting') : t('vendor.apply.submit')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={{ alignItems: 'center' }}>
            <Text style={{ color: Brand.textSecondary, fontSize: 12 }}>{t('vendor.apply.backToLogin')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

const inputStyle = {
  borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10,
  paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Brand.textPrimary, backgroundColor: '#fff',
} as const;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (the existing `loadStalls` effect pattern was already lint-clean before this task; this task doesn't touch that effect).

- [ ] **Step 4: Manual UI verification**

With the dev server running (`npx expo start --web`), go to `http://localhost:8081/vendor-apply`:
- Password + Confirm Password fields render below Phone.
- Submit button stays disabled until a stall is picked, all required fields are filled, password is ≥8 chars, and both password fields match.
- Submitting with mismatched passwords: button is disabled (can't even trigger the mismatch — this is caught by `canSubmit`, not a separate runtime check, so there's no error alert to see for this case by design).
- Submitting a valid application for a still-unclaimed stall (e.g. "Green Harvest") succeeds, shows the updated "you can log in..." message, and returns to vendor-login.
- Confirm the new applicant can immediately log in at `/vendor-login` — expected: signed in, then bounced back out with "not registered as a vendor" (since not yet approved) — this is the existing safety net from `vendor-login.tsx`, not new behavior, but worth seeing it fire for a genuinely pre-approval account for the first time.

- [ ] **Step 5: Commit**

```bash
git add src/app/vendor-apply.tsx
git commit -m "$(cat <<'EOF'
feat(vendor): apply form collects a password instead of admin generating one

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `(admin)/applications.tsx` — simplified approve, function-based reject

**Files:**
- Modify: `src/app/(admin)/applications.tsx:48-87` (`handleApprove` and `handleReject`)

**Interfaces:**
- Consumes: `approve-vendor-application` (Task 4), `reject-vendor-application` (Task 5) Edge Functions.

- [ ] **Step 1: Simplify `handleApprove`**

Find:
```typescript
  async function handleApprove() {
    if (!selected) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('approve-vendor-application', {
      body: { application_id: selected.id },
    });
    setBusy(false);
    if (error || data?.error) {
      showAlert(t('admin.applications.errorTitle'), data?.error ?? error?.message ?? 'Unknown error');
      return;
    }
    closeModal();
    void load();
    showAlert(
      t('admin.applications.approvedTitle'),
      t('admin.applications.approvedMsg', { password: data.temp_password }),
    );
  }
```
Replace with:
```typescript
  async function handleApprove() {
    if (!selected) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('approve-vendor-application', {
      body: { application_id: selected.id },
    });
    setBusy(false);
    if (error || data?.error) {
      showAlert(t('admin.applications.errorTitle'), data?.error ?? error?.message ?? 'Unknown error');
      return;
    }
    closeModal();
    void load();
    showAlert(t('admin.applications.approvedTitle'), t('admin.applications.approvedMsg'));
  }
```

- [ ] **Step 2: Swap `handleReject` to call the new function**

Find:
```typescript
  async function handleReject() {
    if (!selected) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('vendor_applications')
      .update({
        status: 'rejected',
        reviewer_note: rejectNote.trim() || null,
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', selected.id);
    setBusy(false);
    if (error) {
      showAlert(t('admin.applications.errorTitle'), error.message);
      return;
    }
    closeModal();
    void load();
  }
```
Replace with:
```typescript
  async function handleReject() {
    if (!selected) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('reject-vendor-application', {
      body: { application_id: selected.id, reviewer_note: rejectNote.trim() || undefined },
    });
    setBusy(false);
    if (error || data?.error) {
      showAlert(t('admin.applications.errorTitle'), data?.error ?? error?.message ?? 'Unknown error');
      return;
    }
    closeModal();
    void load();
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual UI verification**

At `http://localhost:8081/(admin)/applications` (logged in as admin):
- Approving a pending application shows "Vendor approved" / "They can log in with the password they set when applying." — no password shown.
- Submit a fresh test application via `/vendor-apply`, then reject it from the admin panel with a note. Confirm it disappears from the pending list, and confirm (via `/vendor-login`) that email/password combo no longer works at all — the account should be gone, not just unlinked.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/applications.tsx"
git commit -m "$(cat <<'EOF'
feat(vendor): admin approve/reject use the simplified password-free flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Full end-to-end verification pass

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Confirm all three functions are the currently-deployed versions**

Run: `npx supabase functions list --project-ref rxrxsgsxbuevclfqwhtu` (or check the dashboard: Functions tab) — `apply-vendor-application`, `approve-vendor-application`, `reject-vendor-application` should all show a version bumped by this plan's deploys (Tasks 3–5).

- [ ] **Step 2: Full apply → approve → login loop, entirely through the UI**

1. `/vendor-apply` — submit for "Som Tam Station" (or whichever stall is currently unclaimed) with a real password.
2. `/(admin)/applications` — find it, approve it. Confirm the success message has no password in it.
3. `/vendor-login` — log in with the email/password from step 1. Confirm it lands on `/(vendor)/overview` for the right stall.

- [ ] **Step 3: Full apply → reject → dead-account loop, entirely through the UI**

1. `/vendor-apply` — submit for a different still-unclaimed stall.
2. `/(admin)/applications` — reject it with a note.
3. `/vendor-login` — confirm that email/password combo fails outright (account deleted, not just unlinked).
4. `/vendor-apply` — confirm that same stall is available again in the dropdown (rejecting frees it, same as before this plan).

- [ ] **Step 4: Final typecheck + lint sweep**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean — this is the final gate before considering the feature done.

- [ ] **Step 5: No commit for this task** (verification-only; if Steps 2–3 turn up a bug, fix it as a new small commit and re-run the affected steps).
