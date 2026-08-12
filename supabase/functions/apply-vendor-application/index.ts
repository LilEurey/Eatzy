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
