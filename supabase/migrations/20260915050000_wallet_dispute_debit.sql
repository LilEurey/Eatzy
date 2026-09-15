-- Migration: wallet_dispute_debit
-- A card dispute on a wallet top-up (charge.dispute.created, handled in the
-- stripe-webhook edge function) needs the mirror image of topup_wallet: pull
-- the disputed amount back out of the student's wallet_balance instead of
-- crediting it. Clamped to whatever's actually left in the wallet — the
-- student may have already spent it (possibly via a transfer already sent
-- on to a vendor's Stripe account), and this app doesn't attempt to reverse
-- those vendor transfers. Any shortfall is a real loss the platform absorbs
-- (this is exactly what platform-owned negative balance liability in the
-- Connect config is for) and needs manual follow-up — logged in the
-- description, not auto-recovered.

create or replace function public.debit_wallet_for_dispute(
  p_user_id   uuid,
  p_amount    numeric,
  p_reference text
)
returns numeric -- amount actually debited; less than p_amount if the wallet balance was insufficient
language plpgsql security definer
set search_path = ''
as $$
declare
  v_current numeric;
  v_debited numeric;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not_authorized';
  end if;

  if p_amount <= 0 then
    raise exception 'dispute_amount_must_be_positive';
  end if;

  if p_reference is null or p_reference = '' then
    raise exception 'dispute_reference_required';
  end if;

  if exists (
    select 1 from public.wallet_transactions
     where type = 'payment' and reference = p_reference
  ) then
    return 0;
  end if;

  select wallet_balance into v_current from public.users where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found';
  end if;

  v_debited := least(p_amount, v_current);

  perform set_config('app.bypass_wallet_guard', 'on', true);

  update public.users
     set wallet_balance = wallet_balance - v_debited
   where id = p_user_id;

  insert into public.wallet_transactions (user_id, type, amount, reference, description)
  values (
    p_user_id, 'payment', -v_debited, p_reference,
    case when v_debited < p_amount
      then 'Payment disputed — charged back (wallet balance covered only part of it, remainder absorbed by platform)'
      else 'Payment disputed — top-up charged back'
    end
  );

  return v_debited;
end;
$$;

create unique index wallet_transactions_dispute_reference_unique
  on public.wallet_transactions (reference)
  where type = 'payment' and reference like 'dispute:%';

revoke execute on function public.debit_wallet_for_dispute(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.debit_wallet_for_dispute(uuid, numeric, text) to service_role;
