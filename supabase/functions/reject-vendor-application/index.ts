// Rejects a pending vendor_applications row: marks it rejected. Does NOT
// touch the applicant's auth account — under Google-only auth that account
// is the applicant's real, persistent identity (used for the rest of the
// app), not something created just for this application. Deleting it here
// would delete a real user's account over a rejected stall claim.
//
// Deploy: supabase functions deploy reject-vendor-application --use-api

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
