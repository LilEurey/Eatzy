-- Migration: stripe_topup
-- Wallet top-ups now go through a real Stripe PaymentIntent (see
-- create-topup-intent / stripe-webhook edge functions) instead of the old
-- "tap a button, wallet_balance goes up" demo flow. topup_wallet becomes a
-- webhook-only credit: it takes the Stripe PaymentIntent id as an
-- idempotency key (webhooks can retry) and is no longer callable by
-- students directly — only the service role (stripe-webhook, after it has
-- verified Stripe's signature and confirmed the charge) can call it.

-- create or replace can't change topup_wallet's signature — Postgres would
-- keep the old 2-arg overload alongside the new one (still callable by
-- authenticated, still crediting arbitrary free money). Drop it explicitly.
drop function if exists public.topup_wallet(uuid, numeric);

create or replace function public.topup_wallet(
  p_user_id   uuid,
  p_amount    numeric,
  p_reference text
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Real money now only lands here via the Stripe webhook (service_role).
  -- auth.uid() is null for that caller, so this is intentionally NOT the
  -- same "self or nothing" check the other escrow RPCs use.
  if auth.role() <> 'service_role' then
    raise exception 'not_authorized';
  end if;

  if p_amount <= 0 then
    raise exception 'topup_amount_must_be_positive';
  end if;

  if p_reference is null or p_reference = '' then
    raise exception 'topup_reference_required';
  end if;

  -- Webhook retries (Stripe resends on anything but a 2xx) must not double-
  -- credit. wallet_transactions_topup_reference_unique below is the actual
  -- guard against a race; this is just an early, cheap no-op return.
  if exists (
    select 1 from public.wallet_transactions
     where type = 'topup' and reference = p_reference
  ) then
    return;
  end if;

  perform set_config('app.bypass_wallet_guard', 'on', true);

  update public.users
     set wallet_balance = wallet_balance + p_amount
   where id = p_user_id;

  insert into public.wallet_transactions (user_id, type, amount, reference, description)
  values (p_user_id, 'topup', p_amount, p_reference, 'Wallet top-up');
end;
$$;

create unique index wallet_transactions_topup_reference_unique
  on public.wallet_transactions (reference)
  where type = 'topup';

revoke execute on function public.topup_wallet(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.topup_wallet(uuid, numeric, text) to service_role;
