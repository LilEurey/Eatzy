// Creates a Stripe PaymentIntent for a Campus Wallet top-up. Plain payment
// on the platform's own account — no Connect involved, students aren't
// connected accounts. The wallet only gets credited once stripe-webhook
// sees payment_intent.succeeded; this function never touches wallet_balance.
//
// Deploy: supabase functions deploy create-topup-intent
// Secrets:  supabase secrets set STRIPE_SECRET_KEY=sk_test_...

import Stripe from 'npm:stripe@18';
import { callerClient, corsAndJson } from '../_shared/http.ts';

const MIN_TOPUP_THB = 20; // ponytail: rough floor so Stripe's fixed per-charge fee doesn't dwarf tiny top-ups; tune once real pricing is set.
const MAX_TOPUP_THB = 10000;

Deno.serve(async (req) => {
  const { cors, json } = corsAndJson(req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) return json({ error: 'Stripe is not configured', code: 'STRIPE_NOT_CONFIGURED' }, 500);

  const { data: { user: caller } } = await callerClient(authHeader).auth.getUser();
  if (!caller) return json({ error: 'Invalid session' }, 401);

  let body: { amount?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const amount = body.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < MIN_TOPUP_THB || amount > MAX_TOPUP_THB) {
    return json({ error: `amount must be between ฿${MIN_TOPUP_THB} and ฿${MAX_TOPUP_THB}`, code: 'INVALID_AMOUNT' }, 400);
  }

  const stripe = new Stripe(stripeSecretKey);

  let intent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // THB smallest unit (satang)
      currency: 'thb',
      payment_method_types: ['promptpay'],
      metadata: { user_id: caller.id, kind: 'topup' }, // stripe-webhook only credits kind=topup
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Could not start payment', code: 'PAYMENT_INTENT_FAILED' }, 502);
  }

  return json({ client_secret: intent.client_secret });
});
