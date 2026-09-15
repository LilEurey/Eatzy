-- Migration: order_stripe_transfer
-- Tracks whether a completed order's payout has actually been sent to the
-- vendor's Stripe connected account (see transfer-order-payout edge
-- function). Separate from the existing internal wallet_transactions
-- 'transfer' row that finalize_order_handoff already writes: that's the
-- in-app ledger (always happens, instant); this column is the real-money
-- side-effect (only happens once the vendor has finished Stripe onboarding,
-- can lag or fail independently) and doubles as its idempotency marker.

alter table public.orders
  add column stripe_transfer_id text unique;

comment on column public.orders.stripe_transfer_id is
  'Stripe Transfer id once this order''s payout reached the vendor''s connected account. Null until transfer-order-payout succeeds.';
