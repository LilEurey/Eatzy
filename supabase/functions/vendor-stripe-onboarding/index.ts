// Starts (or resumes) a vendor's Stripe Connect onboarding. Creates a v2
// connected account on first call — dashboard: 'none', recipient
// configuration, platform-owned fee collection and negative balance
// liability (see docs/superpowers/specs 2026-09-15 Stripe Connect design) —
// then always issues a fresh Account Link, since links expire after a few
// minutes and can only be used once.
//
// Stripe-hosted onboarding only runs in a real browser context (Stripe
// blocks it inside a plain in-app WebView), so the client must open the
// returned `url` with expo-web-browser's openBrowserAsync (SFSafariViewController
// on iOS, Custom Tabs on Android) — not a WebView component.
//
// One-time prerequisite this code can't do for you: the platform account
// must acknowledge negative-balance liability on the Connect platform
// profile page (dashboard.stripe.com/settings/connect/platform-profile)
// before any v2 account can be created — Stripe rejects account creation
// with account_creation_liability_unacknowledged until that's done.
//
// Deploy: supabase functions deploy vendor-stripe-onboarding
// Secrets:  supabase secrets set STRIPE_SECRET_KEY=sk_test_...

import Stripe from 'npm:stripe@18';
import { callerClient, corsAndJson, serviceClient } from '../_shared/http.ts';

// ponytail: pinned to the API version documented for v2 core accounts at
// build time. Bump this (and re-check docs.stripe.com/api/v2/core/accounts)
// if Stripe cuts a newer version before this ships.
const STRIPE_API_VERSION = '2026-08-26.dahlia';

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

  let body: { return_url?: string; refresh_url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const returnUrl = body.return_url?.trim();
  if (!returnUrl) return json({ error: 'return_url is required', code: 'MISSING_FIELDS' }, 400);
  const refreshUrl = body.refresh_url?.trim() || returnUrl;

  const { data: vendor, error: vendorError } = await adminClient
    .from('vendors')
    .select('id, name, stripe_account_id')
    .eq('owner_user_id', caller.id)
    .maybeSingle();
  if (vendorError) return json({ error: vendorError.message }, 500);
  if (!vendor) return json({ error: 'No store found for this account', code: 'NOT_A_VENDOR' }, 404);

  const stripe = new Stripe(stripeSecretKey, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });

  let accountId = vendor.stripe_account_id;
  if (!accountId) {
    // Identity (country, entity type, legal name...) is deliberately left
    // unset here — dashboard: 'none' with Stripe-owned requirement
    // collection means the hosted onboarding form collects it directly from
    // the vendor instead of us guessing it up front.
    let account;
    try {
      account = await stripe.v2.core.accounts.create({
        contact_email: caller.email,
        display_name: vendor.name,
        dashboard: 'none',
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
        defaults: {
          currency: 'thb',
          responsibilities: {
            fees_collector: 'application',
            losses_collector: 'application',
          },
        },
      });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'Could not create Stripe account', code: 'STRIPE_ACCOUNT_CREATE_FAILED' }, 502);
    }
    accountId = account.id;

    const { error: updateError } = await adminClient
      .from('vendors')
      .update({ stripe_account_id: accountId })
      .eq('id', vendor.id);
    if (updateError) return json({ error: updateError.message }, 500);
  }

  let link;
  try {
    link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: returnUrl,
      refresh_url: refreshUrl,
      collection_options: { fields: 'eventually_due' },
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Could not create onboarding link', code: 'ACCOUNT_LINK_FAILED' }, 502);
  }

  return json({ url: link.url, account_id: accountId });
});
