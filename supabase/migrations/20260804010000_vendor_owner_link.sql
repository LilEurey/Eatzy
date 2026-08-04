-- Migration: vendor_owner_link
-- Links a vendors row to the public.users row that manages it, and grants
-- that vendor owner read/write access (via RLS) to their own vendor's
-- orders/menu_items/payments — the join core_tables.sql left for later.

alter table public.vendors
  add column owner_user_id uuid references public.users(id) on delete set null;

create unique index vendors_owner_user_id_key
  on public.vendors (owner_user_id)
  where owner_user_id is not null;


-- ─── vendors: owner can update their own stall ────────────────────────────────
create policy "vendors: owner update"
  on public.vendors for update
  using (owner_user_id = auth.uid());


-- ─── menu_items: owner can manage their own catalog ───────────────────────────
create policy "menu_items: owner insert"
  on public.menu_items for insert
  with check (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );

create policy "menu_items: owner update"
  on public.menu_items for update
  using (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );

create policy "menu_items: owner delete"
  on public.menu_items for delete
  using (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );


-- ─── orders: vendor owner can read/update orders placed at their stall ────────
create policy "orders: vendor owner reads own stall"
  on public.orders for select
  using (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );

create policy "orders: vendor owner updates own stall"
  on public.orders for update
  using (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );


-- ─── order_items / payments: vendor owner can read via their own orders ───────
create policy "order_items: vendor owner reads via own order"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      join public.vendors v on v.id = o.vendor_id
      where o.id = order_id and v.owner_user_id = auth.uid()
    )
  );

create policy "payments: vendor owner reads via own order"
  on public.payments for select
  using (
    exists (
      select 1 from public.orders o
      join public.vendors v on v.id = o.vendor_id
      where o.id = order_id and v.owner_user_id = auth.uid()
    )
  );


-- ─── Fix release_escrow_to_vendor: it was crediting a vendors.id as if it ─────
-- were a users.id (orders.vendor_id references vendors, not users — there was
-- never a link to resolve the actual owner until this migration). Never
-- exercised yet (no caller), so this was a silent bug, not a regression.
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
  v_amount    numeric;
begin
  select o.vendor_id, p.amount
    into v_vendor_id, v_amount
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

  select owner_user_id into v_owner_id from public.vendors where id = v_vendor_id;

  if v_owner_id is not null then
    update public.users
       set wallet_balance = wallet_balance + v_amount
     where id = v_owner_id;

    insert into public.wallet_transactions (user_id, type, amount, reference, description)
    values (v_owner_id, 'transfer', v_amount, p_order_id::text, 'Escrow released for completed order');
  end if;
end;
$$;
