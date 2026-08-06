-- Migration: fix_escrow_rpc_ownership
-- place_order_escrow, release_escrow_to_vendor, refund_escrow, and
-- topup_wallet are all SECURITY DEFINER (they bypass RLS) but never checked
-- the caller's identity against the account/order they operate on. Any
-- authenticated user could top up an arbitrary account, debit someone
-- else's wallet against an order that isn't theirs, or release/refund
-- escrow for any order in the system. Add ownership checks to each.
--
-- place_order_escrow also stops trusting the client-supplied p_amount: the
-- companion migration (fix_order_item_pricing) recomputes orders.total_amount
-- server-side from real menu_items prices once order_items are inserted, but
-- cart.tsx still calls this RPC with its own (pre-recompute) client-side
-- total. p_amount is kept in the signature for client compatibility but is
-- ignored — the authoritative orders.total_amount is read instead, so a
-- forged client amount can no longer under-charge escrow.

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

  update public.users
     set wallet_balance = wallet_balance + p_amount
   where id = p_user_id;

  insert into public.wallet_transactions (user_id, type, amount, description)
  values (p_user_id, 'topup', p_amount, 'Wallet top-up');
end;
$$;
