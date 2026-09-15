// Refreshes a vendor's stripe_payouts_enabled flag by asking Stripe directly
// for their connected account's current recipient capability status.
//
// Deliberately pull-based rather than listening for Stripe's
// v2.core.account[configuration.recipient].capability_status_updated event:
// that's a *thin* event on the newer v2 Events/Event Destinations system
// (separate registration from the classic /v1/webhook_endpoints this app
// already uses for payment_intent.succeeded, and a different SDK parsing
// path). The order-completion transfer function also re-checks this status
// live via the Stripe API right before transferring, so a webhook here
// would only ever be a UI-freshness nice-to-have, not a correctness
// requirement — not worth standing up a second event system for yet.
//
// Deploy: supabase functions deploy vendor-stripe-status

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@18';
import { corsHeaders } from '../_shared/cors.ts';

const STRIPE_API_VERSION = '2026-08-26.dahlia';

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
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) return json({ error: 'Stripe is not configured', code: 'STRIPE_NOT_CONFIGURED' }, 500);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) return json({ error: 'Invalid session' }, 401);

  const { data: vendor, error: vendorError } = await adminClient
    .from('vendors')
    .select('id, stripe_account_id')
    .eq('owner_user_id', caller.id)
    .maybeSingle();
  if (vendorError) return json({ error: vendorError.message }, 500);
  if (!vendor) return json({ error: 'No store found for this account', code: 'NOT_A_VENDOR' }, 404);
  if (!vendor.stripe_account_id) return json({ payouts_enabled: false });

  const stripe = new Stripe(stripeSecretKey, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });

  let account;
  try {
    account = await stripe.v2.core.accounts.retrieve(vendor.stripe_account_id, {
      include: ['configuration.recipient'],
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Could not check Stripe account status', code: 'STRIPE_RETRIEVE_FAILED' }, 502);
  }

  const payoutsEnabled = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === 'active';

  const { error: updateError } = await adminClient
    .from('vendors')
    .update({ stripe_payouts_enabled: payoutsEnabled })
    .eq('id', vendor.id);
  if (updateError) return json({ error: updateError.message }, 500);

  return json({ payouts_enabled: payoutsEnabled });
});
