// Stripe calls this directly (see supabase/config.toml: verify_jwt = false
// for this function — there's no Supabase session to check, only Stripe's
// own request signature).
//
// Handles payment_intent.succeeded for Campus Wallet top-ups: credits the
// wallet via the service-role-only topup_wallet RPC, keyed by the
// PaymentIntent id so Stripe's automatic retries can't double-credit.
//
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets:  supabase secrets set STRIPE_SECRET_KEY=sk_test_...
//           supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// (STRIPE_WEBHOOK_SECRET comes from the Dashboard webhook endpoint you
// register pointing at this function's URL, or from `stripe listen` locally.)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@18';

// Deno has no synchronous Node crypto, so signature verification needs the
// async/SubtleCrypto variant — see Supabase's own stripe-webhooks example.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!stripeSecretKey || !webhookSecret) {
    return new Response('Stripe is not configured', { status: 500 });
  }
  const stripe = new Stripe(stripeSecretKey);

  const signature = req.headers.get('Stripe-Signature');
  if (!signature) return new Response('Missing Stripe-Signature header', { status: 400 });

  // constructEventAsync needs the raw body — do not JSON.parse it first,
  // that would break signature verification.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err instanceof Error ? err.message : err}`, { status: 400 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const userId = intent.metadata.user_id;
    if (!userId) {
      console.error(`payment_intent.succeeded ${intent.id} has no metadata.user_id — ignoring`);
      return Response.json({ ok: true });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error } = await adminClient.rpc('topup_wallet', {
      p_user_id: userId,
      p_amount: intent.amount / 100,
      p_reference: intent.id,
    });
    if (error) {
      // Non-2xx makes Stripe retry with backoff — the right move for a
      // transient DB error. topup_wallet itself is idempotent on p_reference.
      console.error(`topup_wallet failed for ${intent.id}:`, error.message);
      return new Response(error.message, { status: 500 });
    }
  }

  return Response.json({ ok: true });
});
