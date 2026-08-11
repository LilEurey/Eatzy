// One-time helper to create the very first admin account. Deploy, invoke
// once, then delete — see bootstrap_admin() migration for why this can't
// gate on an existing admin JWT the way approve-vendor-application does.
//
// Deploy: supabase functions deploy bootstrap-admin
// Delete after use: supabase functions delete bootstrap-admin

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

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.email || !body.password) return json({ error: 'email and password are required' }, 400);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return json({ error: createError?.message ?? 'Could not create user' }, 500);
  }

  const { error: promoteError } = await adminClient.rpc('bootstrap_admin', { p_user_id: created.user.id });
  if (promoteError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return json({ error: promoteError.message }, 409);
  }

  return json({ ok: true, user_id: created.user.id });
});
