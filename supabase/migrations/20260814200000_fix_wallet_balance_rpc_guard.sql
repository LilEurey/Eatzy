-- Migration: fix_wallet_balance_rpc_guard
-- prevent_privileged_self_update got a bypass_role_guard escape hatch for
-- role changes (vendor_applications migration) but never got the matching
-- one for wallet_balance — so every wallet_balance UPDATE, including the
-- legitimate ones inside topup_wallet/place_order_escrow/
-- release_escrow_to_vendor/refund_escrow, has been raising "wallet_balance
-- cannot be changed via direct update" since the guard trigger shipped.
-- Add the same narrow, transaction-scoped bypass for wallet_balance and set
-- it inside each escrow/topup RPC right before their update.

create or replace function public.prevent_privileged_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.bypass_role_guard', true) = 'on' then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'role cannot be changed via direct update';
  end if;
  if new.wallet_balance is distinct from old.wallet_balance
     and current_setting('app.bypass_wallet_guard', true) is distinct from 'on' then
    raise exception 'wallet_balance cannot be changed via direct update, use topup_wallet/escrow RPCs';
  end if;
  return new;
end;
$$;


create or replace function public.place_order_escrow(
  p_user_id     uuid,
  p_order_id    uuid,
  p_amount      numeric
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_amount numeric;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'not_authorized';
  end if;

  select total_amount into v_amount
    from public.orders
   where id = p_order_id and user_id = p_user_id;

  if not found then
    raise exception 'order_not_found_or_not_owned';
  end if;

  perform set_config('app.bypass_wallet_guard', 'on', true);

  update public.users
     set wallet_balance = wallet_balance - v_amount
   where id = p_user_id
     and wallet_balance >= v_amount;

  if not found then
    raise exception 'insufficient_wallet_balance';
  end if;

  insert into public.payments (order_id, amount, method, status)
  values (p_order_id, v_amount, 'wallet', 'pending');

  insert into public.wallet_transactions (user_id, type, amount, reference, description)
  values (p_user_id, 'payment', -v_amount, p_order_id::text, 'Order payment held in escrow');
end;
$$;


create or replace function public.release_escrow_to_vendor(
  p_order_id uuid
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid;
  v_owner_id  uuid;
  v_student_id uuid;
  v_amount    numeric;
begin
  select o.vendor_id, o.user_id, p.amount
    into v_vendor_id, v_student_id, v_amount
    from public.orders o
    join public.payments p on p.order_id = o.id
   where o.id = p_order_id
     and p.status = 'pending';

  if not found then
    raise exception 'order_not_found_or_already_settled';
  end if;

  select owner_user_id into v_owner_id from public.vendors where id = v_vendor_id;

  if auth.uid() is distinct from v_student_id and auth.uid() is distinct from v_owner_id then
    raise exception 'not_authorized';
  end if;

  update public.payments
     set status = 'completed', paid_at = now()
   where order_id = p_order_id;

  if v_owner_id is not null then
    perform set_config('app.bypass_wallet_guard', 'on', true);

    update public.users
       set wallet_balance = wallet_balance + v_amount
     where id = v_owner_id;

    insert into public.wallet_transactions (user_id, type, amount, reference, description)
    values (v_owner_id, 'transfer', v_amount, p_order_id::text, 'Escrow released for completed order');
  end if;
end;
$$;


create or replace function public.refund_escrow(
  p_order_id uuid
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid;
  v_owner_id  uuid;
  v_user_id   uuid;
  v_amount    numeric;
begin
  select o.vendor_id, o.user_id, p.amount
    into v_vendor_id, v_user_id, v_amount
    from public.orders o
    join public.payments p on p.order_id = o.id
   where o.id = p_order_id
     and p.status = 'pending';

  if not found then
    raise exception 'order_not_found_or_already_settled';
  end if;

  select owner_user_id into v_owner_id from public.vendors where id = v_vendor_id;

  if auth.uid() is distinct from v_owner_id then
    raise exception 'not_authorized';
  end if;

  update public.payments
     set status = 'refunded', paid_at = now()
   where order_id = p_order_id;

  perform set_config('app.bypass_wallet_guard', 'on', true);

  update public.users
     set wallet_balance = wallet_balance + v_amount
   where id = v_user_id;

  insert into public.wallet_transactions (user_id, type, amount, reference, description)
  values (v_user_id, 'refund', v_amount, p_order_id::text, 'Escrow refunded — order cancelled/rejected');
end;
$$;


create or replace function public.topup_wallet(
  p_user_id uuid,
  p_amount  numeric
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'not_authorized';
  end if;

  if p_amount <= 0 then
    raise exception 'topup_amount_must_be_positive';
  end if;

  perform set_config('app.bypass_wallet_guard', 'on', true);

  update public.users
     set wallet_balance = wallet_balance + p_amount
   where id = p_user_id;

  insert into public.wallet_transactions (user_id, type, amount, description)
  values (p_user_id, 'topup', p_amount, 'Wallet top-up');
end;
$$;
