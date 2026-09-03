-- Migration: block_orders_for_closed_vendors
-- Hard backstop: reject any order insert when the target vendor is closed
-- (vendors.is_open = false). The student side gates add-to-cart and checkout
-- in item/[id].tsx and cart.tsx, but the order row is a raw client insert
-- (see src/app/cart.tsx) with no RLS/trigger enforcement, so a vendor that
-- closes while a dish sits in the cart could still receive an order.
--
-- Raises the sentinel message 'vendor_closed', matching how cart.tsx already
-- special-cases 'insufficient_wallet_balance' / 'addon_rule_violation'.

create or replace function public.orders_reject_when_vendor_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.vendors
    where id = new.vendor_id and is_open
  ) then
    raise exception 'vendor_closed' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger orders_reject_when_vendor_closed
  before insert on public.orders
  for each row
  execute function public.orders_reject_when_vendor_closed();
