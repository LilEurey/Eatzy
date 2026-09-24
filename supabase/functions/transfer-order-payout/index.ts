// Sends a completed order's payout to the vendor's Stripe connected account,
// then record_vendor_payout() stamps orders.stripe_transfer_id and debits the
// vendor's in-app wallet_balance ("earned, not yet paid out") in one
// transaction — so the in-app credit and the Stripe transfer are never both
// kept.
// Called by the client right after either handoff-confirmation RPC succeeds
// (student_confirm_pickup / vendor_confirm_handoff) — since finalize_order_handoff
// only actually completes the order once BOTH sides have confirmed, most
// calls land before that and just no-op; the one that tips it over does the
// real transfer. Safe to call repeatedly: idempotent on orders.stripe_transfer_id
// (checked here, enforced by the column's unique constraint) and passes a
// stable Stripe idempotency key as a second line of defense against a race
// between the two confirming callers.
//
// ponytail: the auto_finalize_stale_handoffs cron fallback (stuck orders no
// one confirms) completes orders with no live client around to call this —
// those payouts stay untransferred until someone opens the order again.
// Fine for now (money is still correctly reflected in the vendor's in-app
// wallet_balance via the existing ledger); add a periodic reconciliation
// sweep if stale-handoff volume turns out to matter.
//
// Deploy: supabase functions deploy transfer-order-payout

import Stripe from 'npm:stripe@18';
import { callerClient, corsAndJson, serviceClient } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const { cors, json } = corsAndJson(req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) return json({ error: 'Stripe is not configured', code: 'STRIPE_NOT_CONFIGURED' }, 500);

  const adminClient = serviceClient();
  const { data: { user: caller } } = await callerClient(authHeader).auth.getUser();
  if (!caller) return json({ error: 'Invalid session' }, 401);

  let body: { order_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const orderId = body.order_id;
  if (!orderId) return json({ error: 'order_id is required', code: 'MISSING_FIELDS' }, 400);

  const { data: order, error: orderError } = await adminClient
    .from('orders')
    .select('id, status, user_id, vendor_id, stripe_transfer_id')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) return json({ error: orderError.message }, 500);
  if (!order) return json({ error: 'Order not found', code: 'NOT_FOUND' }, 404);

  const { data: vendor, error: vendorError } = await adminClient
    .from('vendors')
    .select('owner_user_id, stripe_account_id, stripe_payouts_enabled')
    .eq('id', order.vendor_id)
    .maybeSingle();
  if (vendorError) return json({ error: vendorError.message }, 500);
  if (!vendor) return json({ error: 'Vendor not found', code: 'NOT_FOUND' }, 404);

  const isStudent = caller.id === order.user_id;
  const isVendorOwner = caller.id === vendor.owner_user_id;
  if (!isStudent && !isVendorOwner) return json({ error: 'Not authorized', code: 'NOT_AUTHORIZED' }, 403);

  if (order.status !== 'completed') return json({ ok: false, reason: 'not_completed' });
  if (order.stripe_transfer_id) return json({ ok: true, already_transferred: true });
  if (!vendor.stripe_account_id || !vendor.stripe_payouts_enabled) {
    return json({ ok: false, reason: 'vendor_not_onboarded' });
  }

  // Pay what the student was actually charged (payments.amount, frozen at
  // accept time), not orders.total_amount, which is recomputed from order_items.
  const { data: payment, error: paymentError } = await adminClient
    .from('payments')
    .select('amount')
    .eq('order_id', order.id)
    .eq('status', 'completed')
    .maybeSingle();
  if (paymentError) return json({ error: paymentError.message }, 500);
  if (!payment) return json({ ok: false, reason: 'no_completed_payment' });

  const stripe = new Stripe(stripeSecretKey);

  let transfer;
  try {
    // The idempotency key below only lives 24h. If an earlier call's Stripe
    // transfer succeeded but recording it failed, a later retry must reuse
    // that transfer, not send a second one.
    const existing = await stripe.transfers.list({ transfer_group: order.id, limit: 1 });
    transfer = existing.data[0] ?? await stripe.transfers.create(
      {
        amount: Math.round(payment.amount * 100),
        currency: 'thb',
        destination: vendor.stripe_account_id,
        transfer_group: order.id,
      },
      { idempotencyKey: `order-transfer-${order.id}` },
    );
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Transfer failed', code: 'TRANSFER_FAILED' }, 502);
  }

  const { error: recordError } = await adminClient.rpc('record_vendor_payout', {
    p_order_id: order.id,
    p_transfer_id: transfer.id,
  });
  if (recordError) return json({ error: recordError.message }, 500);

  return json({ ok: true, transfer_id: transfer.id });
});
