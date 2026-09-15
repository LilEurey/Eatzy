-- Migration: vendor Stripe Connect fields
-- Adds the columns needed to onboard vendors as Stripe Connect connected
-- accounts (Accounts v2, recipient configuration, dashboard: none — see
-- docs/superpowers/specs 2026-09-15 Stripe Connect design). stripe_account_id
-- is set by the create-connect-account edge function (service role) right
-- after a vendor is provisioned; stripe_payouts_enabled flips true once the
-- account's stripe_transfers capability goes active (also service role, via
-- the account.updated webhook).
--
-- Both columns are readable under the existing "vendors: public read" policy.
-- A Stripe connected account id isn't a secret by itself (it can't move
-- money without the platform's secret key), so no extra RLS is needed.

alter table public.vendors
  add column stripe_account_id     text unique,
  add column stripe_payouts_enabled boolean not null default false;

comment on column public.vendors.stripe_account_id is
  'Stripe Connect v2 connected account id (acct_...). Null until onboarding starts.';
comment on column public.vendors.stripe_payouts_enabled is
  'True once configuration.recipient.capabilities.stripe_balance.stripe_transfers is active. Gates order-completion transfers.';
