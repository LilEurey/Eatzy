-- Migration: fix_order_item_pricing
-- order_items.unit_price and orders.subtotal/total_amount were entirely
-- client-supplied with only a `>= 0` check — a client bypassing the app UI
-- could insert order_items with a forged low unit_price (unrelated to the
-- real menu_items.price), then pass a matching forged total to
-- place_order_escrow, paying almost nothing for real food. Recompute
-- unit_price server-side from the live menu_items row, and recompute the
-- parent order's subtotal/total_amount from its line items.

create or replace function public.enforce_order_item_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select price into new.unit_price
    from public.menu_items
   where id = new.menu_item_id;

  if new.unit_price is null then
    raise exception 'menu_item_not_found';
  end if;

  return new;
end;
$$;

create trigger order_items_enforce_price
  before insert on public.order_items
  for each row execute procedure public.enforce_order_item_price();


create or replace function public.recompute_order_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_subtotal numeric;
begin
  select coalesce(sum(quantity * unit_price), 0)
    into v_subtotal
    from public.order_items
   where order_id = v_order_id;

  update public.orders
     set subtotal = v_subtotal,
         total_amount = v_subtotal + packaging_fee
   where id = v_order_id;

  return null;
end;
$$;

create trigger order_items_recompute_order_totals
  after insert or update or delete on public.order_items
  for each row execute procedure public.recompute_order_totals();
