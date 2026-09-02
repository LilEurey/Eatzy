// Creates a vendor's store account. Admins provision email/password accounts
// for stalls (vendors no longer sign in with Google) — this creates the auth
// user, then calls provision_vendor to build the vendors row and flip the
// role. The admin hands the credentials to the vendor afterwards.
//
// Admin-gated the same way as approve-vendor-application: verify the caller's
// JWT resolves to a user whose users.role is 'admin'.
//
// Deploy: supabase functions deploy admin-create-vendor

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const MIN_PASSWORD_LENGTH = 10; // Mirror auth.minimum_password_length in config.toml.

function normalizeTags(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : [];
  return raw
    .map((t) => String(t).trim())
    .filter((t) => t.length > 0);
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

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

  let body: { email?: string; password?: string; business_name?: string; cuisine_tags?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const email = body.email?.trim();
  const password = body.password ?? '';
  const businessName = body.business_name?.trim();
  const cuisineTags = normalizeTags(body.cuisine_tags);

  if (!email || !password || !businessName) {
    return json({ error: 'email, password and business_name are required', code: 'MISSING_FIELDS' }, 400);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, code: 'WEAK_PASSWORD' },
      400,
    );
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    // Duplicate email, weak/pwned password, etc. — GoTrue's message is descriptive.
    return json({ error: createError?.message ?? 'Could not create account', code: 'CREATE_FAILED' }, 422);
  }
  const userId = created.user.id;

  const provision = async () =>
    adminClient.rpc('provision_vendor', {
      p_user_id: userId,
      p_business_name: businessName,
      p_cuisine_tags: cuisineTags,
    });

  let { error: rpcError } = await provision();

  if (rpcError) {
    // Postgres unique_violation on vendors_owner_user_id_key: this account
    // already owns a store. The account pre-existed — do NOT delete it.
    if (rpcError.code === '23505') {
      return json({ error: 'This account already has a store.', code: 'ALREADY_HAS_STORE' }, 409);
    }

    // handle_new_user runs in the signup transaction and should have committed
    // the public.users row before createUser() returned. If provision_vendor
    // still can't see it, retry once before giving up.
    if (rpcError.message.includes('user_not_found')) {
      await new Promise((r) => setTimeout(r, 250));
      ({ error: rpcError } = await provision());
    }

    if (rpcError) {
      await adminClient.auth.admin.deleteUser(userId);
      return json({ error: rpcError.message, code: 'PROVISION_FAILED' }, 500);
    }
  }

  return json({ ok: true, user_id: userId });
});
