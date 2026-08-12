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
