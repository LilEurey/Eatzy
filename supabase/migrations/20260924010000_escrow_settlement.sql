-- Migration: escrow_settlement
-- Findings from the 2026-09-24 full-codebase audit.
--
-- 1. refund_escrow() read payments.status = 'pending' without a lock and its
--    UPDATE had no status predicate, while still granted to authenticated:
--    two concurrent calls (or one racing finalize_order_handoff) credited the
--    student twice / paid both sides. Nothing in the app called it. Dropped.
-- 2. Once accepted (charged), an order could never be cancelled — no path
--    moved accepted/ready -> rejected with a refund, so a vendor who couldn't
--    cook left the student's money in escrow forever. vendor_cancel_order()
--    is that path: order and payment locked, exactly one refund.
-- 3. Vendors were paid twice: finalize_order_handoff credits their in-app
--    wallet_balance AND transfer-order-payout sends the same amount via
--    Stripe. The in-app balance now means "earned, not yet paid out":
--    record_vendor_payout() debits it when the Stripe transfer lands.
--    (place_order() already stops vendors spending it.)
-- 4. A won dispute was never re-credited after debit_wallet_for_dispute.
-- 5. `auth.role() <> 'service_role'` is NULL (so passes) when auth.role() is
--    NULL; use `is distinct from`.
-- 6. auto_finalize_stale_handoffs skipped orders with a NULL pickup_end forever.

-- ─── 1 ───────────────────────────────────────────────────────────────────────
drop function if exists public.refund_escrow(uuid);

-- ─── 2 ───────────────────────────────────────────────────────────────────────
-- ready -> rejected joins the allowed edges (accepted -> rejected already was).
create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not (
    (old.status = 'pending'  and new.status in ('accepted', 'rejected', 'cancelled')) or
    (old.status = 'accepted' and new.status in ('ready', 'rejected', 'cancelled'))    or
    (old.status = 'ready'    and new.status in ('completed', 'rejected', 'cancelled'))
  ) then
    raise exception 'invalid_order_status_transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

create or replace function public.vendor_cancel_order(p_order_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_user_id  uuid;
  v_status   text;
  v_amount   numeric;
begin
  select v.owner_user_id, o.user_id, o.status
    into v_owner_id, v_user_id, v_status
    from public.orders o
    join public.vendors v on v.id = o.vendor_id
   where o.id = p_order_id
   for update of o;

  if not found then
    raise exception 'order_not_found';
  end if;

  if auth.uid() is distinct from v_owner_id then
    raise exception 'not_authorized';
  end if;

  if v_status not in ('accepted', 'ready') then
    raise exception 'order_not_cancellable';
  end if;

  select amount into v_amount
    from public.payments
   where order_id = p_order_id and status = 'pending'
   for update;

  if found then
    update public.payments
       set status = 'refunded', paid_at = now()
     where order_id = p_order_id and status = 'pending';

    perform set_config('app.bypass_wallet_guard', 'on', true);

    update public.users
       set wallet_balance = wallet_balance + v_amount
     where id = v_user_id;

    insert into public.wallet_transactions (user_id, type, amount, reference, description)
    values (v_user_id, 'refund', v_amount, p_order_id::text, 'Order cancelled by vendor — refunded');
  end if;

  update public.orders set status = 'rejected' where id = p_order_id;
end;
$$;

revoke execute on function public.vendor_cancel_order(uuid) from public, anon;
grant execute on function public.vendor_cancel_order(uuid) to authenticated;

-- A rejection that followed a charge says "refunded", not just "couldn't accept".
alter table public.notifications drop constraint if exists notifications_event_check;
alter table public.notifications
  add constraint notifications_event_check
  check (event in ('order_accepted', 'order_ready', 'order_rejected', 'order_refunded', 'order_completed', 'vendor_new_order'));

create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor_name text;
  v_icon        text;
  v_title       text;
  v_body        text;
  v_queue       text;
  v_event       text;
begin
  if new.status is distinct from old.status
     and new.status in ('accepted', 'ready', 'rejected', 'completed')
     and (select notifications_enabled from public.users where id = new.user_id) then

    select name into v_vendor_name from public.vendors where id = new.vendor_id;
    v_queue := coalesce(new.queue_number::text, '—');

    case new.status
      when 'accepted' then
        v_icon  := '👨‍🍳';
        v_title := 'Order accepted!';
        v_body  := v_vendor_name || ' is preparing your order · Queue #' || v_queue;
        v_event := 'order_accepted';
      when 'ready' then
        v_icon  := '🎉';
        v_title := 'Order ready for pickup!';
        v_body  := v_vendor_name || ' · Queue #' || v_queue;
        v_event := 'order_ready';
      when 'rejected' then
        v_icon := '😕';
        if exists (select 1 from public.payments where order_id = new.id and status = 'refunded') then
          v_title := 'Order cancelled';
          v_body  := v_vendor_name || ' cancelled your order — you''ve been refunded';
          v_event := 'order_refunded';
        else
          v_title := 'Order rejected';
          v_body  := v_vendor_name || ' couldn''t accept your order';
          v_event := 'order_rejected';
        end if;
      when 'completed' then
        v_icon  := '✅';
        v_title := 'Order picked up';
        v_body  := 'Enjoy your meal from ' || v_vendor_name || '!';
        v_event := 'order_completed';
    end case;

    insert into public.notifications (user_id, order_id, type, icon, title, body, event, vendor_name, queue_number)
    values (new.user_id, new.id, 'order', v_icon, v_title, v_body, v_event, v_vendor_name, new.queue_number);
  end if;

  return new;
end;
$$;

revoke execute on function public.notify_order_status_change() from public, anon, authenticated;

-- ─── 3 ───────────────────────────────────────────────────────────────────────
-- Called by transfer-order-payout after Stripe accepted the transfer. Claims
-- the order's stripe_transfer_id and debits the vendor's earned balance in
-- the same transaction, so a retry can do neither twice.
create or replace function public.record_vendor_payout(p_order_id uuid, p_transfer_id text)
returns boolean -- false = already recorded
language plpgsql security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_amount   numeric;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not_authorized';
  end if;

  update public.orders
     set stripe_transfer_id = p_transfer_id
   where id = p_order_id
     and stripe_transfer_id is null
     and status = 'completed';

  if not found then
    return false;
  end if;

  select v.owner_user_id, p.amount
    into v_owner_id, v_amount
    from public.orders o
    join public.vendors v on v.id = o.vendor_id
    join public.payments p on p.order_id = o.id and p.status = 'completed'
   where o.id = p_order_id;

  if v_owner_id is null then
    return true;
  end if;

  perform 1 from public.users where id = v_owner_id for update;
  perform set_config('app.bypass_wallet_guard', 'on', true);

  -- Clamped at 0: orders completed before this migration were credited in-app
  -- but some may have been partially paid out already.
  update public.users
     set wallet_balance = greatest(wallet_balance - v_amount, 0)
   where id = v_owner_id;

  insert into public.wallet_transactions (user_id, type, amount, reference, description)
  values (v_owner_id, 'transfer', -v_amount, 'payout:' || p_order_id::text, 'Paid out to bank via Stripe');

  return true;
end;
$$;

create unique index if not exists wallet_transactions_payout_reference_unique
  on public.wallet_transactions (reference)
  where type = 'transfer' and reference like 'payout:%';

revoke execute on function public.record_vendor_payout(uuid, text) from public, anon, authenticated;
grant execute on function public.record_vendor_payout(uuid, text) to service_role;

-- ─── 4 ───────────────────────────────────────────────────────────────────────
-- Gives back exactly what debit_wallet_for_dispute actually took (it clamps
-- to the balance), once per dispute.
create or replace function public.recredit_wallet_for_dispute(p_reference text)
returns numeric
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_debited numeric;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not_authorized';
  end if;

  select user_id, -amount into v_user_id, v_debited
    from public.wallet_transactions
   where type = 'payment' and reference = p_reference;

  if not found or v_debited <= 0 then
    return 0;
  end if;

  if exists (
    select 1 from public.wallet_transactions
     where type = 'refund' and reference = p_reference || ':won'
  ) then
    return 0;
  end if;

  perform set_config('app.bypass_wallet_guard', 'on', true);

  update public.users
     set wallet_balance = wallet_balance + v_debited
   where id = v_user_id;

  insert into public.wallet_transactions (user_id, type, amount, reference, description)
  values (v_user_id, 'refund', v_debited, p_reference || ':won', 'Dispute resolved — top-up restored');

  return v_debited;
end;
$$;

create unique index if not exists wallet_transactions_dispute_won_reference_unique
  on public.wallet_transactions (reference)
  where type = 'refund' and reference like 'dispute:%:won';

revoke execute on function public.recredit_wallet_for_dispute(text) from public, anon, authenticated;
grant execute on function public.recredit_wallet_for_dispute(text) to service_role;

-- ─── 5 ───────────────────────────────────────────────────────────────────────
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
  if auth.role() is distinct from 'service_role' then
    raise exception 'not_authorized';
  end if;

  if p_amount <= 0 then
    raise exception 'topup_amount_must_be_positive';
  end if;

  if p_reference is null or p_reference = '' then
    raise exception 'topup_reference_required';
  end if;

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

create or replace function public.debit_wallet_for_dispute(
  p_user_id   uuid,
  p_amount    numeric,
  p_reference text
)
returns numeric
language plpgsql security definer
set search_path = ''
as $$
declare
  v_current numeric;
  v_debited numeric;
begin
  if auth.role() is distinct from 'service_role' then
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

-- ─── 6 ───────────────────────────────────────────────────────────────────────
create or replace function public.auto_finalize_stale_handoffs()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select id from public.orders
     where status = 'ready'
       and (vendor_handed_off_at is not null or student_picked_up_at is not null)
       and coalesce(pickup_end, created_at + interval '1 hour') < now() - interval '2 hours'
  loop
    update public.orders
       set vendor_handed_off_at  = coalesce(vendor_handed_off_at, now()),
           student_picked_up_at = coalesce(student_picked_up_at, now())
     where id = r.id;

    perform public.finalize_order_handoff(r.id);
  end loop;
end;
$$;
