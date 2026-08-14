// Approves a pending vendor_applications row: the applicant's auth account
// already exists (their real, persistent Google-signed-in identity) — this
// creates their vendors row from the application's own business details and
// flips their role, via the approve_vendor_application RPC.
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
      : 'APPROVE_FAILED';
    return json({ error: msg, code }, 409);
  }

  return json({ ok: true });
});
