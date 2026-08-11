// Approves a pending vendor_applications row: creates the applicant's auth
// account (needs the service_role key, so this can't run client-side),
// links them to the claimed stall via the approve_vendor_application RPC,
// and returns a one-time temp password for the admin to relay to the vendor.
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

function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Service-role client: bypasses RLS for the privileged work below. Caller
  // identity is established separately from their own JWT (next block), not
  // implied by holding this client.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Caller-scoped client: resolves who's actually calling, from their JWT.
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

  const { data: application, error: fetchError } = await adminClient
    .from('vendor_applications')
    .select('id, email, full_name, status')
    .eq('id', body.application_id)
    .maybeSingle();
  if (fetchError || !application) return json({ error: 'Application not found' }, 404);
  if (application.status !== 'pending') return json({ error: 'Application already reviewed' }, 409);

  const tempPassword = generateTempPassword();
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: application.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: application.full_name },
  });
  if (createError || !created.user) {
    return json({ error: createError?.message ?? 'Could not create vendor account' }, 500);
  }

  const { error: approveError } = await adminClient.rpc('approve_vendor_application', {
    p_application_id: application.id,
    p_new_user_id: created.user.id,
    p_admin_id: caller.id,
  });
  if (approveError) {
    // Don't leave an orphaned auth user behind if linking the stall failed
    // (e.g. someone else claimed it in the meantime).
    await adminClient.auth.admin.deleteUser(created.user.id);
    return json({ error: approveError.message }, 409);
  }

  return json({ temp_password: tempPassword });
});
