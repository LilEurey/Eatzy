# Vendor Google-Only Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace vendor email/password login with the same Google OAuth screen students already use, and move the vendor apply flow from a public pre-login form to an authenticated in-app action.

**Architecture:** `(auth)/index.tsx`'s existing Google button becomes the only sign-in screen for students and vendors. `vendor-login.tsx` is deleted. `/vendor-apply` moves behind auth (removed from `_layout.tsx`'s `PUBLIC_ROUTES`), reached from a new row in the student profile screen. `apply-vendor-application` stops creating auth accounts — it just records an application against the caller's existing JWT identity — and `reject-vendor-application` stops deleting the applicant's account, since that account is a real, persistent identity now, not a throwaway created at apply time. `approve-vendor-application` and its SQL RPC need no changes.

**Tech Stack:** Expo Router, Supabase Auth/Postgres/Edge Functions (Deno), NativeWind-free inline RN styles (matches existing files), `@supabase/supabase-js@2` (client and `jsr:` import in Edge Functions).

## Global Constraints

- Admin auth is out of scope — stays password-based, URL-only, unlinked from the UI. Do not touch `admin-login.tsx` or the admin bootstrap flow.
- `manager@maleethai.eatzy.app` (Phase-1 seed vendor, Malee's Thai Kitchen) is left completely untouched — no migration, no data reset. It just loses its UI login path once `vendor-login.tsx` is deleted; that's accepted, not a bug to fix.
- `reject-vendor-application` must never delete the applicant's auth account — that assumption from the password-based design is now false and removing it is the one correctness-critical change in this plan.
- `en.ts` / `th.ts` must stay in exact key parity — `TranslationKey = keyof typeof en`, and `th.ts` is typed as `Record<TranslationKey, string>`, so a key present in one and missing in the other fails `tsc`.
- Run `npx tsc --noEmit` and `npm run lint` clean before every commit (project `CLAUDE.md`).
- Commit after every task, conventional commit format (`feat(vendor): ...`, `fix(vendor): ...`).
- No automated test framework in this repo. Verification is `tsc`/lint plus Node scripts run directly against the live linked Supabase project (ref `rxrxsgsxbuevclfqwhtu`) using `@supabase/supabase-js` (already a project dependency) — the same style used for every prior vendor-application change this session, because `curl` bypasses `supabase-js`'s own error handling and has already hidden a real bug once.
- No browser automation tool is available this session. Nothing in this plan can verify actual button clicks, redirect flow rendering, or the real Google OAuth popup/redirect — every verification step is at the API/DB layer. Say so plainly in the final report; don't claim UI verification that didn't happen.
- Get the service role key once via `npx supabase projects api-keys --project-ref rxrxsgsxbuevclfqwhtu --reveal` (the `service_role` row) — needed by every Node verification script below (`SUPABASE_SERVICE_ROLE_KEY`). `SUPABASE_URL` and `SUPABASE_ANON_KEY` are `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `.env.local`.

---

### Task 1: New migration — per-applicant pending index

**Files:**
- Create: `supabase/migrations/20260812020000_vendor_apply_google_only.sql`

**Interfaces:**
- Produces: a new unique index `vendor_applications_one_pending_per_applicant`, referenced by name in Task 2's Edge Function error-mapping logic.

- [ ] **Step 1: Write the migration**

```sql
-- Migration: vendor_apply_google_only
-- Backstops apply-vendor-application's ALREADY_APPLIED pre-check: one
-- pending application per applicant, mirroring the existing one-per-stall
-- index. See docs/superpowers/specs/2026-08-12-vendor-google-only-auth-design.md.

create unique index vendor_applications_one_pending_per_applicant
  on public.vendor_applications (applicant_user_id)
  where status = 'pending';
```

- [ ] **Step 2: Push it**

Run: `npx supabase db push --linked --yes`
Expected: completes with no error, reports the new migration applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260812020000_vendor_apply_google_only.sql
git commit -m "$(cat <<'EOF'
feat(vendor): add per-applicant pending-application index

Backstops the ALREADY_APPLIED check the rewritten
apply-vendor-application function will add next — closes the race if
two requests from the same applicant land concurrently.
EOF
)"
```

---

### Task 2: Rewrite `apply-vendor-application` — no more account creation

**Files:**
- Modify: `supabase/functions/apply-vendor-application/index.ts` (full rewrite)

**Interfaces:**
- Consumes: `vendor_applications_one_pending_per_applicant` (Task 1), the existing `vendor_applications_one_pending_per_vendor` index, the existing dual-client caller-verification pattern already used by `approve-vendor-application`/`reject-vendor-application`.
- Produces: `POST /functions/v1/apply-vendor-application`, now JWT-required. Body `{ vendor_id, full_name, phone, bio? }` (no `email`, no `password`). Success `{ ok: true }`. Errors `{ error, code }` where `code` is one of `MISSING_FIELDS` (400), `NOT_STUDENT` (409), `ALREADY_APPLIED` (409), `STALL_UNAVAILABLE` (409), `STALL_ALREADY_PENDING` (409), `INSERT_FAILED` (500) — consumed by Task 4's `vendor-apply.tsx`.

- [ ] **Step 1: Replace the file**

```typescript
// Authenticated endpoint: the applicant already has a real (Google-signed-in)
// account before calling this — it only records the application against
// their own id. No auth account creation, nothing to clean up on failure.
//
// Deploy: supabase functions deploy apply-vendor-application --use-api

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
  if (callerProfile?.role !== 'student') {
    return json({ error: "This account can't apply for a vendor stall", code: 'NOT_STUDENT' }, 409);
  }

  let body: { vendor_id?: string; full_name?: string; phone?: string; bio?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body', code: 'MISSING_FIELDS' }, 400);
  }

  const { vendor_id, full_name, phone } = body;
  if (!vendor_id || !full_name || !phone) {
    return json({ error: 'vendor_id, full_name, and phone are required', code: 'MISSING_FIELDS' }, 400);
  }

  const { data: existingPending } = await adminClient
    .from('vendor_applications')
    .select('id')
    .eq('applicant_user_id', caller.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (existingPending) {
    return json({ error: 'You already have a pending application', code: 'ALREADY_APPLIED' }, 409);
  }

  const { data: vendor } = await adminClient
    .from('vendors')
    .select('id, owner_user_id')
    .eq('id', vendor_id)
    .maybeSingle();
  if (!vendor || vendor.owner_user_id !== null) {
    return json({ error: 'This stall is no longer available', code: 'STALL_UNAVAILABLE' }, 409);
  }

  const { error: insertError } = await adminClient.from('vendor_applications').insert({
    vendor_id,
    full_name,
    email: caller.email,
    phone,
    bio: body.bio || null,
    applicant_user_id: caller.id,
  });
  if (insertError) {
    const msg = insertError.message ?? '';
    if (msg.includes('vendor_applications_one_pending_per_vendor')) {
      return json({ error: 'This stall already has a pending application', code: 'STALL_ALREADY_PENDING' }, 409);
    }
    if (msg.includes('vendor_applications_one_pending_per_applicant')) {
      return json({ error: 'You already have a pending application', code: 'ALREADY_APPLIED' }, 409);
    }
    return json({ error: insertError.message, code: 'INSERT_FAILED' }, 500);
  }

  return json({ ok: true });
});
```

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy apply-vendor-application --project-ref rxrxsgsxbuevclfqwhtu --use-api`
Expected: deploy succeeds.

- [ ] **Step 3: Write and run the verification script**

Create `verify-apply.mjs` in your scratchpad (not committed) and run it with:
`SUPABASE_URL=<from .env.local> SUPABASE_ANON_KEY=<from .env.local> SUPABASE_SERVICE_ROLE_KEY=<from Step 0 above> node verify-apply.mjs`

```javascript
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error('set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');

const admin = createClient(url, serviceKey);
const anon = createClient(url, anonKey);
const MALEES_ID = 'f87c67e2-51cd-40a9-abdc-74c4bc5250ce'; // permanently-claimed seed vendor, read-only use

async function callApply(token, body) {
  const res = await fetch(`${url}/functions/v1/apply-vendor-application`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

// 1. NOT_STUDENT — sign in as the seed vendor account
const { data: vendorSignIn, error: vendorSignInErr } = await anon.auth.signInWithPassword({
  email: 'manager@maleethai.eatzy.app', password: 'jzWQpIYhiY3!Aa1',
});
if (vendorSignInErr) throw vendorSignInErr;
const r1 = await callApply(vendorSignIn.session.access_token, { vendor_id: MALEES_ID, full_name: 'x', phone: '0800000000' });
console.log('1. NOT_STUDENT expected — got:', r1.status, r1.json);

// 2. Disposable test student
const testEmail = `verify.apply.${Date.now()}@example.com`;
const testPassword = 'Verify1234!';
const { data: created, error: createErr } = await admin.auth.admin.createUser({ email: testEmail, password: testPassword, email_confirm: true });
if (createErr) throw createErr;
const testUserId = created.user.id;
const { data: studentSignIn, error: studentSignInErr } = await anon.auth.signInWithPassword({ email: testEmail, password: testPassword });
if (studentSignInErr) throw studentSignInErr;
const token = studentSignIn.session.access_token;

// 3. STALL_UNAVAILABLE — caller has no pending application yet, stall is permanently claimed
const r2 = await callApply(token, { vendor_id: MALEES_ID, full_name: 'Verify Test', phone: '0800000000' });
console.log('2. STALL_UNAVAILABLE expected — got:', r2.status, r2.json);

// 4. Two disposable unclaimed stalls (name is the only required column)
const { data: stallA } = await admin.from('vendors').insert({ name: 'Verify Stall A' }).select('id').single();
const { data: stallB } = await admin.from('vendors').insert({ name: 'Verify Stall B' }).select('id').single();

// 5. Success
const r3 = await callApply(token, { vendor_id: stallA.id, full_name: 'Verify Test', phone: '0800000000' });
console.log('3. ok:true expected — got:', r3.status, r3.json);

// 6. ALREADY_APPLIED — caller now has a pending application from step 5
const r4 = await callApply(token, { vendor_id: stallB.id, full_name: 'Verify Test', phone: '0800000000' });
console.log('4. ALREADY_APPLIED expected — got:', r4.status, r4.json);

// Cleanup
await admin.from('vendors').delete().in('id', [stallA.id, stallB.id]); // cascades the vendor_applications row
await admin.auth.admin.deleteUser(testUserId);
console.log('cleanup done');
```

Expected output: line 1 shows `409 { code: 'NOT_STUDENT' }`, line 2 shows `409 { code: 'STALL_UNAVAILABLE' }`, line 3 shows `200 { ok: true }`, line 4 shows `409 { code: 'ALREADY_APPLIED' }`, then `cleanup done`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/apply-vendor-application/index.ts
git commit -m "$(cat <<'EOF'
feat(vendor): apply-vendor-application no longer creates an account

Under Google-only auth the applicant already has a real account before
calling this — it now just records the application against their JWT
identity (role must be student). Drops account creation, password
validation, EMAIL_IN_USE handling, and the orphan-cleanup delete that
used to run when the DB insert failed after account creation.
EOF
)"
```

---

### Task 3: `reject-vendor-application` — stop deleting the applicant's account

**Files:**
- Modify: `supabase/functions/reject-vendor-application/index.ts`

**Interfaces:**
- Consumes: nothing new — same admin-JWT-gated pattern it already has.
- Produces: `POST /functions/v1/reject-vendor-application` unchanged in shape (`{ application_id, reviewer_note? }` → `{ ok: true }`), but the applicant's `auth.users` row now survives rejection.

- [ ] **Step 1: Remove the delete-user step**

In `supabase/functions/reject-vendor-application/index.ts`, remove this block (and update the file's leading comment, which currently says deletion is intentional):

```typescript
  if (application.applicant_user_id) {
    await adminClient.auth.admin.deleteUser(application.applicant_user_id);
  }

```

Replace the file's top comment block from:

```typescript
// Rejects a pending vendor_applications row: deletes the applicant's auth
// account (created at apply time, no longer wanted) and marks the
// application rejected, in one call — so a mid-way failure can't leave the
// application pointing at a deleted account without a rejected status.
//
// Deploy: supabase functions deploy reject-vendor-application
```

to:

```typescript
// Rejects a pending vendor_applications row: marks it rejected. Does NOT
// touch the applicant's auth account — under Google-only auth that account
// is the applicant's real, persistent identity (used for the rest of the
// app), not something created just for this application. Deleting it here
// would delete a real user's account over a rejected stall claim.
//
// Deploy: supabase functions deploy reject-vendor-application --use-api
```

The function body after this change goes straight from the `status !== 'pending'` check to the `update({ status: 'rejected', ... })` call — no other lines change.

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy reject-vendor-application --project-ref rxrxsgsxbuevclfqwhtu --use-api`
Expected: deploy succeeds.

- [ ] **Step 3: Write and run the verification script**

Create `verify-reject.mjs` in your scratchpad, run the same way as Task 2's script (same three env vars).

```javascript
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, serviceKey);
const anon = createClient(url, anonKey);

async function callFn(name, token, body) {
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

const testEmail = `verify.reject.${Date.now()}@example.com`;
const testPassword = 'Verify1234!';
const { data: created } = await admin.auth.admin.createUser({ email: testEmail, password: testPassword, email_confirm: true });
const testUserId = created.user.id;
const { data: studentSignIn } = await anon.auth.signInWithPassword({ email: testEmail, password: testPassword });
const studentToken = studentSignIn.session.access_token;

const { data: stall } = await admin.from('vendors').insert({ name: 'Verify Reject Stall' }).select('id').single();

const applyRes = await callFn('apply-vendor-application', studentToken, { vendor_id: stall.id, full_name: 'Verify Test', phone: '0800000000' });
console.log('apply:', applyRes.status, applyRes.json);

const { data: application } = await admin.from('vendor_applications').select('id').eq('applicant_user_id', testUserId).eq('status', 'pending').single();

const { data: adminSignIn } = await anon.auth.signInWithPassword({ email: 'admin@eatzy.app', password: 'PSuJx53Cuf2SiBia' });
const adminToken = adminSignIn.session.access_token;

const rejectRes = await callFn('reject-vendor-application', adminToken, { application_id: application.id, reviewer_note: 'verify script' });
console.log('reject:', rejectRes.status, rejectRes.json);

// The regression check that matters: the applicant's account must survive.
const { data: stillExists, error: getUserErr } = await admin.auth.admin.getUserById(testUserId);
console.log('account still exists (expected true):', !getUserErr && !!stillExists?.user, stillExists?.user?.email);

const { data: appAfter } = await admin.from('vendor_applications').select('status').eq('id', application.id).single();
console.log('application status (expected rejected):', appAfter.status);

// Cleanup
await admin.from('vendors').delete().eq('id', stall.id);
await admin.auth.admin.deleteUser(testUserId);
console.log('cleanup done');
```

Expected output: `apply` shows `200 { ok: true }`, `reject` shows `200 { ok: true }`, `account still exists (expected true): true verify.reject.<ts>@example.com`, `application status (expected rejected): rejected`, then `cleanup done`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/reject-vendor-application/index.ts
git commit -m "$(cat <<'EOF'
fix(vendor): reject-vendor-application must not delete the applicant

Deleting the applicant's account on rejection was correct under the
old password-based design (the account only existed for the
application) but is wrong now — under Google-only auth it's the
applicant's real, ongoing account. Rejecting a stall claim should only
ever change that application's status.
EOF
)"
```

---

### Task 4: `vendor-apply.tsx` — drop password/email fields

**Files:**
- Modify: `src/app/vendor-apply.tsx` (full rewrite)
- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/th.ts`

**Interfaces:**
- Consumes: `apply-vendor-application`'s new body shape and error codes (Task 2), `invokeEdgeFunction` from `src/lib/edge-function.ts` (unchanged, already exists).
- Produces: no change to the route name `/vendor-apply` that Task 6 links to.

- [ ] **Step 1: Replace `src/app/vendor-apply.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { invokeEdgeFunction } from '@/lib/edge-function';

type UnclaimedStall = { id: string; name: string; stall_number: string | null };

const ERROR_CODE_KEYS: Record<string, TranslationKey> = {
  NOT_STUDENT: 'vendor.apply.notStudentMsg',
  ALREADY_APPLIED: 'vendor.apply.alreadyAppliedMsg',
  STALL_ALREADY_PENDING: 'vendor.apply.stallAlreadyPendingMsg',
  STALL_UNAVAILABLE: 'vendor.apply.stallUnavailableMsg',
};

export default function VendorApplyScreen() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [stalls, setStalls] = useState<UnclaimedStall[]>([]);
  const [stallsLoading, setStallsLoading] = useState(true);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email ?? ''));
  }, []);

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

  const canSubmit = !!vendorId && !!fullName.trim() && !!phone.trim() && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const { error } = await invokeEdgeFunction('apply-vendor-application', {
      body: { vendor_id: vendorId, full_name: fullName.trim(), phone: phone.trim(), bio: bio.trim() || null },
    });
    setSubmitting(false);
    if (error) {
      const messageKey = error.code ? ERROR_CODE_KEYS[error.code] : undefined;
      showAlert(t('vendor.apply.errorTitle'), messageKey ? t(messageKey) : error.message);
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

          {!!email && (
            <Text style={{ fontSize: 13, color: Brand.textSecondary, marginBottom: 18 }}>
              {email}
            </Text>
          )}

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

          <Field label={t('vendor.apply.phoneLabel')}>
            <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={inputStyle} placeholderTextColor="#B0B4BF" />
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

- [ ] **Step 2: Update `src/lib/i18n/en.ts`**

Replace the `vendor.apply.*` block (currently lines 358–382) with:

```typescript
  'vendor.apply.title': 'Apply for a Vendor Account',
  'vendor.apply.subtitle': 'Claim your stall and an admin will review your application.',
  'vendor.apply.stallLabel': 'Your Stall',
  'vendor.apply.stallPlaceholder': 'Select your stall…',
  'vendor.apply.noStalls': 'No unclaimed stalls right now — check with the canteen office.',
  'vendor.apply.fullNameLabel': 'Full Name',
  'vendor.apply.phoneLabel': 'Phone Number',
  'vendor.apply.bioLabel': 'About Your Stall (optional)',
  'vendor.apply.bioPlaceholder': 'What do you serve?',
  'vendor.apply.submit': 'Submit Application',
  'vendor.apply.submitting': 'Submitting…',
  'vendor.apply.submittedTitle': 'Application submitted',
  'vendor.apply.submittedMsg': 'An admin will review your application. You’ll get vendor access on this account once it’s approved.',
  'vendor.apply.errorTitle': 'Couldn’t submit application',
  'vendor.apply.notStudentMsg': 'This account can’t apply for a vendor stall.',
  'vendor.apply.alreadyAppliedMsg': 'You already have a pending application.',
  'vendor.apply.stallAlreadyPendingMsg': 'This stall already has a pending application.',
  'vendor.apply.stallUnavailableMsg': 'This stall was just claimed by someone else.',
  'vendor.apply.backToLogin': '← Back',
```

- [ ] **Step 3: Update `src/lib/i18n/th.ts`**

Replace the `vendor.apply.*` block (currently lines 360–384) with:

```typescript
  'vendor.apply.title': 'สมัครเป็นผู้ขาย',
  'vendor.apply.subtitle': 'เลือกร้านของคุณ แล้วแอดมินจะตรวจสอบใบสมัคร',
  'vendor.apply.stallLabel': 'ร้านของคุณ',
  'vendor.apply.stallPlaceholder': 'เลือกร้านของคุณ…',
  'vendor.apply.noStalls': 'ตอนนี้ไม่มีร้านว่าง — ติดต่อสำนักงานโรงอาหาร',
  'vendor.apply.fullNameLabel': 'ชื่อ-นามสกุล',
  'vendor.apply.phoneLabel': 'เบอร์โทรศัพท์',
  'vendor.apply.bioLabel': 'เกี่ยวกับร้านของคุณ (ไม่บังคับ)',
  'vendor.apply.bioPlaceholder': 'ร้านคุณขายอะไร?',
  'vendor.apply.submit': 'ส่งใบสมัคร',
  'vendor.apply.submitting': 'กำลังส่ง…',
  'vendor.apply.submittedTitle': 'ส่งใบสมัครแล้ว',
  'vendor.apply.submittedMsg': 'แอดมินจะตรวจสอบใบสมัครของคุณ คุณจะได้สิทธิ์ผู้ขายในบัญชีนี้ทันทีที่ได้รับการอนุมัติ',
  'vendor.apply.errorTitle': 'ส่งใบสมัครไม่สำเร็จ',
  'vendor.apply.notStudentMsg': 'บัญชีนี้ไม่สามารถสมัครเป็นผู้ขายได้',
  'vendor.apply.alreadyAppliedMsg': 'คุณมีใบสมัครที่รอตรวจสอบอยู่แล้ว',
  'vendor.apply.stallAlreadyPendingMsg': 'ร้านนี้มีใบสมัครที่รอตรวจสอบอยู่แล้ว',
  'vendor.apply.stallUnavailableMsg': 'ร้านนี้เพิ่งถูกจับจองโดยผู้อื่น',
  'vendor.apply.backToLogin': '← กลับ',
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors — this is the step that catches an en/th key mismatch.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/vendor-apply.tsx src/lib/i18n/en.ts src/lib/i18n/th.ts
git commit -m "$(cat <<'EOF'
feat(vendor): drop password/email fields from the apply form

Matches apply-vendor-application's new authenticated shape — the
applicant is already signed in, so email comes from their session
(shown read-only) and there's no password to set anymore.
EOF
)"
```

---

### Task 5: Delete `vendor-login.tsx` and fix everything that pointed at it

**Files:**
- Delete: `src/app/vendor-login.tsx`
- Modify: `src/app/(auth)/index.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: `src/app/(vendor)/_layout.tsx`
- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/th.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no route named `/vendor-login` exists anywhere in the app after this task — Step 5 verifies that with a grep.

- [ ] **Step 1: Delete the file**

```bash
git rm src/app/vendor-login.tsx
```

- [ ] **Step 2: Remove the vendor link from `src/app/(auth)/index.tsx`**

Find and remove this block (it sits right after the Google sign-in `TouchableOpacity` closes):

```typescript
            {/* Vendor link */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
              <Text style={{ color: '#5a4136', fontSize: 16 }}>{t('auth.forVendor')}</Text>
              <TouchableOpacity onPress={() => router.push('/vendor-login' as any)}>
                <Text style={{ color: '#4648d4', fontWeight: '600', fontSize: 14 }}>
                  {t('auth.clickHere')}
                </Text>
              </TouchableOpacity>
            </View>
```

There's no separate vendor entry point anymore — the one Google button above it serves everyone.

- [ ] **Step 3: Update `PUBLIC_ROUTES` in `src/app/_layout.tsx`**

Replace:

```typescript
// Standalone entry points meant to be reached directly (typed URL, bookmark,
// QR code) while signed out — not just via an in-app link from (auth). The
// redirect-to-(auth) effect below must not clobber a hard/first load of one
// of these.
const PUBLIC_ROUTES = ['/vendor-login', '/admin-login', '/vendor-apply'];
```

with:

```typescript
// Standalone entry points meant to be reached directly (typed URL, bookmark,
// QR code) while signed out — not just via an in-app link from (auth). The
// redirect-to-(auth) effect below must not clobber a hard/first load of one
// of these. vendor-apply is deliberately NOT here anymore — applying is now
// an authenticated in-app action (see (tabs)/profile.tsx), so an
// unauthenticated visit should bounce to (auth) like any other protected route.
const PUBLIC_ROUTES = ['/admin-login'];
```

- [ ] **Step 4: Fix the three `/vendor-login` redirects in `src/app/(vendor)/_layout.tsx`**

All three occurrences of the literal `'/vendor-login' as any` become `'/(auth)' as any` (sign-out in the sidebar, sign-out in the topbar, the session-init failure redirect). Also update the stale comment at line 26 (`// ... same breakpoint vendor-login.tsx uses ...`) since that file won't exist anymore — reword to:

```typescript
// Below this width the fixed 220px sidebar leaves too little room for
// content (cards min-width 200-320 start overflowing/overlapping), so
// phones get a bottom tab bar instead.
```

- [ ] **Step 5: Remove now-dead i18n keys**

In `src/lib/i18n/en.ts`, remove the `vendor.login.*` block (currently lines 217–230) **except** `'vendor.login.brand'` — `(vendor)/_layout.tsx` still uses that one for its own topbar. Remove `'auth.forVendor'` and `'auth.clickHere'` too (no longer referenced anywhere).

In `src/lib/i18n/th.ts`, remove the same keys (`vendor.login.*` except `brand`, plus `auth.forVendor`/`auth.clickHere`) — currently at the equivalent line numbers (40–41 and 219–232).

- [ ] **Step 6: Confirm nothing still references the deleted route or keys**

Run: `grep -rn "vendor-login\|auth.forVendor\|auth.clickHere\|vendor.login\." src --include='*.tsx' --include='*.ts'`
Expected: only one line — `'vendor.login.brand'` in `en.ts`, `th.ts`, and its one usage in `(vendor)/_layout.tsx`. Nothing else.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -u src/app/vendor-login.tsx "src/app/(auth)/index.tsx" src/app/_layout.tsx "src/app/(vendor)/_layout.tsx" src/lib/i18n/en.ts src/lib/i18n/th.ts
git commit -m "$(cat <<'EOF'
feat(vendor): delete vendor-login.tsx, use Google auth for everyone

Vendors sign in through the same Google button students already use.
Fixes the three vendor-layout redirects and the login screen's
"for vendor" link that pointed at the now-deleted route, and moves
/vendor-apply off the public-route allowlist since applying is now an
authenticated in-app action, not a pre-login form.
EOF
)"
```

---

### Task 6: Apply entry point in the student profile screen

**Files:**
- Modify: `src/app/(tabs)/profile.tsx`
- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/th.ts`

**Interfaces:**
- Consumes: route `/vendor-apply` (unchanged path, new behavior from Task 4).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the row to `src/app/(tabs)/profile.tsx`**

In the "Account settings links" card, insert a new row between the Notifications row and the Help row:

```typescript
          <TouchableOpacity onPress={() => router.push('/vendor-apply' as any)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F8DDD2' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Ionicons name="storefront-outline" size={20} color="#261812" />
              <Text style={{ fontSize: 16, color: '#261812' }}>{t('profile.applyVendor')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="#5A4136" />
          </TouchableOpacity>

          <TouchableOpacity onPress={comingSoon} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 }}>
```

(That last line is the existing Help row's opening tag — shown so the insertion point is unambiguous; don't duplicate it.)

- [ ] **Step 2: Add the i18n key**

In `src/lib/i18n/en.ts`, add near the other `profile.*` keys:

```typescript
  'profile.applyVendor': 'Apply to open a store',
```

In `src/lib/i18n/th.ts`, add at the equivalent spot:

```typescript
  'profile.applyVendor': 'สมัครเปิดร้าน',
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(tabs)/profile.tsx" src/lib/i18n/en.ts src/lib/i18n/th.ts
git commit -m "$(cat <<'EOF'
feat(vendor): add "Apply to open a store" entry to student profile

The apply flow now requires being signed in, so it needs an in-app
entry point instead of the pre-login link that used to live on the
vendor-login screen.
EOF
)"
```

---

### Task 7: Full round-trip verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1–6.

- [ ] **Step 1: Write and run the approve round-trip script**

Create `verify-approve-roundtrip.mjs` in your scratchpad, run the same way as Task 2/3's scripts.

```javascript
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, serviceKey);
const anon = createClient(url, anonKey);

async function callFn(name, token, body) {
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

const testEmail = `verify.approve.${Date.now()}@example.com`;
const testPassword = 'Verify1234!';
const { data: created } = await admin.auth.admin.createUser({ email: testEmail, password: testPassword, email_confirm: true });
const testUserId = created.user.id;
const { data: studentSignIn } = await anon.auth.signInWithPassword({ email: testEmail, password: testPassword });
const studentToken = studentSignIn.session.access_token;

const { data: stall } = await admin.from('vendors').insert({ name: 'Verify Approve Stall' }).select('id').single();

const applyRes = await callFn('apply-vendor-application', studentToken, { vendor_id: stall.id, full_name: 'Verify Test', phone: '0800000000' });
console.log('apply:', applyRes.status, applyRes.json);

const { data: application } = await admin.from('vendor_applications').select('id').eq('applicant_user_id', testUserId).eq('status', 'pending').single();

const { data: adminSignIn } = await anon.auth.signInWithPassword({ email: 'admin@eatzy.app', password: 'PSuJx53Cuf2SiBia' });
const adminToken = adminSignIn.session.access_token;

const approveRes = await callFn('approve-vendor-application', adminToken, { application_id: application.id });
console.log('approve:', approveRes.status, approveRes.json);

const { data: userAfter } = await admin.from('users').select('role').eq('id', testUserId).single();
console.log('role after approve (expected vendor):', userAfter.role);

const { data: vendorAfter } = await admin.from('vendors').select('owner_user_id').eq('id', stall.id).single();
console.log('owner_user_id after approve (expected to match testUserId below):');
console.log('  owner_user_id:', vendorAfter.owner_user_id);
console.log('  testUserId:   ', testUserId);

// Cleanup — delete the disposable vendor row, then the disposable account
await admin.from('vendors').delete().eq('id', stall.id);
await admin.auth.admin.deleteUser(testUserId);
console.log('cleanup done');
```

Expected: `apply` and `approve` both show `200 { ok: true }`, role is `vendor`, `owner_user_id` matches `testUserId` exactly, then `cleanup done`.

- [ ] **Step 2: Full typecheck and lint pass on the whole diff**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Confirm no dead references remain anywhere**

Run: `grep -rn "__DEV__\|vendor-login" src --include='*.tsx' --include='*.ts'`
Expected: no output.

Run: `grep -rn "vendor\.login\." src --include='*.tsx' --include='*.ts'`
Expected: only `vendor.login.brand` lines (`en.ts`, `th.ts`, and its one usage in `(vendor)/_layout.tsx`) — nothing else.

- [ ] **Step 4: Report the coverage gap plainly**

State explicitly (in the same message the round-trip results are reported in): the real Google OAuth button, the actual redirect-to-`(auth)` behavior for an unauthenticated `/vendor-apply` visit, and the new profile row's on-screen appearance have **not** been click-tested — there's no browser automation tool available this session. Everything verified above is at the Edge Function / database layer via Node scripts using disposable test accounts and disposable vendor rows, all cleaned up afterward.

---

## Self-Review

**Spec coverage:** Auth & entry point (Task 5) · apply flow behind login + profile entry point (Tasks 4, 6) · `vendor-apply.tsx` form shrink (Task 4) · `apply-vendor-application` rewrite (Task 2) · `approve-vendor-application` unchanged (no task needed — explicitly confirmed as out of scope for edits, verified indirectly by Task 7's round trip) · `reject-vendor-application` fix (Task 3) · new unique index (Task 1) · `manager@maleethai.eatzy.app` left untouched (no task — deliberately absent, called out in Global Constraints) · i18n additions/removals (folded into Tasks 4–6, each paired with its code change so `tsc` catches any en/th mismatch immediately).

**Placeholder scan:** none found — every step has real code, real commands, real expected output.

**Type consistency:** `ERROR_CODE_KEYS` in Task 4 matches exactly the four codes `apply-vendor-application` (Task 2) can return alongside `MISSING_FIELDS`/`INSERT_FAILED` (which fall through to the raw error message, same pattern the current file already uses for unmapped codes). The Edge Function body shape `{ vendor_id, full_name, phone, bio }` matches exactly between Task 2's function and Task 4's `invokeEdgeFunction` call.
