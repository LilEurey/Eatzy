-- Migration: escrow_rpc
-- Creates: place_order_escrow(), release_escrow_to_vendor(), refund_escrow(), topup_wallet()

-- ─── Escrow payment RPC ──────────────────────────────────────────────────────
create or replace function public.place_order_escrow(
  p_user_id     uuid,
  p_order_id    uuid,
  p_amount      numeric
)
returns void
language plpgsql security definer
as $$
begin
  update public.users
     set wallet_balance = wallet_balance - p_amount
   where id = p_user_id
     and wallet_balance >= p_amount;

  if not found then
    raise exception 'insufficient_wallet_balance';
  end if;

  insert into public.payments (order_id, amount, method, status)
  values (p_order_id, p_amount, 'wallet', 'pending');

  insert into public.wallet_transactions (user_id, type, amount, reference, description)
  values (p_user_id, 'payment', -p_amount, p_order_id::text, 'Order payment held in escrow');
end;
$$;


-- ─── Release escrow to vendor RPC ────────────────────────────────────────────
create or replace function public.release_escrow_to_vendor(
  p_order_id uuid
)
returns void
language plpgsql security definer
as $$
declare
  v_vendor_id uuid;
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

  update public.payments
     set status = 'completed', paid_at = now()
   where order_id = p_order_id;

  update public.users
     set wallet_balance = wallet_balance + v_amount
   where id = v_vendor_id;

  insert into public.wallet_transactions (user_id, type, amount, reference, description)
  values (v_vendor_id, 'transfer', v_amount, p_order_id::text, 'Escrow released for completed order');
end;
$$;


-- ─── Refund escrow RPC ───────────────────────────────────────────────────────
create or replace function public.refund_escrow(
  p_order_id uuid
)
returns void
language plpgsql security definer
as $$
declare
  v_user_id uuid;
  v_amount  numeric;
begin
  select o.user_id, p.amount
    into v_user_id, v_amount
    from public.orders o
    join public.payments p on p.order_id = o.id
   where o.id = p_order_id
     and p.status = 'pending';

  if not found then
    raise exception 'order_not_found_or_already_settled';
  end if;

  update public.payments
     set status = 'refunded', paid_at = now()
   where order_id = p_order_id;

  update public.users
     set wallet_balance = wallet_balance + v_amount
   where id = v_user_id;

  insert into public.wallet_transactions (user_id, type, amount, reference, description)
  values (v_user_id, 'refund', v_amount, p_order_id::text, 'Escrow refunded — order cancelled/rejected');
end;
$$;


-- ─── Wallet top-up RPC ───────────────────────────────────────────────────────
create or replace function public.topup_wallet(
  p_user_id uuid,
  p_amount  numeric
)
returns void
language plpgsql security definer
as $$
begin
  if p_amount <= 0 then
    raise exception 'topup_amount_must_be_positive';
  end if;

  update public.users
     set wallet_balance = wallet_balance + p_amount
   where id = p_user_id;

  insert into public.wallet_transactions (user_id, type, amount, description)
  values (p_user_id, 'topup', p_amount, 'Wallet top-up');
end;
$$;
