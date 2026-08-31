-- Migration: menu_item_addons
-- Per-item, grouped add-ons ("choose a protein", "extras: pick up to 3").
-- Vendors author groups + options on a dish; students pick them after
-- choosing the main meal. Money rides in child order_item_addons rows with a
-- frozen price snapshot — order_items.unit_price stays the bare menu price.
--
--   menu_items
--     └─ menu_item_addon_groups   (name, min_select, max_select)
--          └─ menu_item_addons     (name, price, is_available)
--   order_items
--     └─ order_item_addons         (frozen name/price snapshot)
--
-- vendor_id is denormalized onto both catalog tables (kept honest by a
-- BEFORE trigger) so the owner RLS policies are the same plain subquery
-- menu_items already uses.


-- ─── menu_item_addon_groups ──────────────────────────────────────────────────
create table public.menu_item_addon_groups (
  id            uuid        default gen_random_uuid() primary key,
  menu_item_id  uuid        references public.menu_items(id) on delete cascade not null,
  vendor_id     uuid        references public.vendors(id) on delete cascade not null,
  name          text        not null,
  name_th       text,
  min_select    int         not null default 0 check (min_select >= 0),
  max_select    int         check (max_select is null or max_select >= 1),
  sort_order    int         not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (max_select is null or max_select >= min_select)
);

create index menu_item_addon_groups_menu_item_id_idx
  on public.menu_item_addon_groups (menu_item_id);

-- Keep vendor_id in lockstep with the parent dish.
create or replace function public.set_addon_group_vendor_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select vendor_id into new.vendor_id
    from public.menu_items
   where id = new.menu_item_id;

  if new.vendor_id is null then
    raise exception 'menu_item_not_found';
  end if;

  return new;
end;
$$;

create trigger menu_item_addon_groups_set_vendor_id
  before insert or update on public.menu_item_addon_groups
  for each row execute procedure public.set_addon_group_vendor_id();

create trigger menu_item_addon_groups_set_updated_at
  before update on public.menu_item_addon_groups
  for each row execute procedure public.set_updated_at();

alter table public.menu_item_addon_groups enable row level security;

create policy "menu_item_addon_groups: public read"
  on public.menu_item_addon_groups for select
  using (true);

create policy "menu_item_addon_groups: owner insert"
  on public.menu_item_addon_groups for insert
  with check (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );

-- WITH CHECK as well as USING: USING gates which existing rows an owner may
-- target, WITH CHECK gates the post-update row. The BEFORE trigger recomputes
-- vendor_id from menu_item_id first, so re-pointing a group at another
-- vendor's dish yields their vendor_id here and the check rejects it.
create policy "menu_item_addon_groups: owner update"
  on public.menu_item_addon_groups for update
  using (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  )
  with check (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );

create policy "menu_item_addon_groups: owner delete"
  on public.menu_item_addon_groups for delete
  using (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );


-- ─── menu_item_addons ────────────────────────────────────────────────────────
create table public.menu_item_addons (
  id            uuid          default gen_random_uuid() primary key,
  group_id      uuid          references public.menu_item_addon_groups(id) on delete cascade not null,
  vendor_id     uuid          references public.vendors(id) on delete cascade not null,
  name          text          not null,
  name_th       text,
  price         numeric(10,2) not null default 0 check (price >= 0),
  is_available  boolean       not null default true,
  sort_order    int           not null default 0,
  updated_at    timestamptz   not null default now()
);

create index menu_item_addons_group_id_idx
  on public.menu_item_addons (group_id);

create or replace function public.set_addon_vendor_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select vendor_id into new.vendor_id
    from public.menu_item_addon_groups
   where id = new.group_id;

  if new.vendor_id is null then
    raise exception 'addon_group_not_found';
  end if;

  return new;
end;
$$;

create trigger menu_item_addons_set_vendor_id
  before insert or update on public.menu_item_addons
  for each row execute procedure public.set_addon_vendor_id();

create trigger menu_item_addons_set_updated_at
  before update on public.menu_item_addons
  for each row execute procedure public.set_updated_at();

alter table public.menu_item_addons enable row level security;

create policy "menu_item_addons: public read"
  on public.menu_item_addons for select
  using (true);

create policy "menu_item_addons: owner insert"
  on public.menu_item_addons for insert
  with check (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );

create policy "menu_item_addons: owner update"
  on public.menu_item_addons for update
  using (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  )
  with check (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );

create policy "menu_item_addons: owner delete"
  on public.menu_item_addons for delete
  using (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );


-- ─── order_item_addons ───────────────────────────────────────────────────────
-- addon_id is nullable + ON DELETE SET NULL: a vendor can delete a catalog
-- add-on later without losing the historical line — name/name_th/price are
-- frozen at order time, same as order_items.unit_price.
create table public.order_item_addons (
  id             uuid          default gen_random_uuid() primary key,
  order_item_id  uuid          references public.order_items(id) on delete cascade not null,
  addon_id       uuid          references public.menu_item_addons(id) on delete set null,
  name           text          not null,
  name_th        text,
  price          numeric(10,2) not null check (price >= 0),
  created_at     timestamptz   not null default now()
);

create index order_item_addons_order_item_id_idx
  on public.order_item_addons (order_item_id);

-- Freeze the snapshot from the live catalog row and reject an add-on that
-- doesn't belong to the same dish as the parent line. Mirrors
-- enforce_order_item_price() — client-sent name/price are ignored.
create or replace function public.enforce_order_item_addon_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_line_menu_item_id  uuid;
  v_addon_menu_item_id uuid;
begin
  if new.addon_id is null then
    raise exception 'addon_not_found';
  end if;

  select mi.name, mi.name_th, mi.price, g.menu_item_id
    into new.name, new.name_th, new.price, v_addon_menu_item_id
    from public.menu_item_addons mi
    join public.menu_item_addon_groups g on g.id = mi.group_id
   where mi.id = new.addon_id;

  if v_addon_menu_item_id is null then
    raise exception 'addon_not_found';
  end if;

  select menu_item_id into v_line_menu_item_id
    from public.order_items
   where id = new.order_item_id;

  if v_line_menu_item_id is distinct from v_addon_menu_item_id then
    raise exception 'addon_not_for_item';
  end if;

  return new;
end;
$$;

create trigger order_item_addons_enforce_snapshot
  before insert on public.order_item_addons
  for each row execute procedure public.enforce_order_item_addon_snapshot();

alter table public.order_item_addons enable row level security;

create policy "order_item_addons: read via own order"
  on public.order_item_addons for select
  using (
    exists (
      select 1
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
       where oi.id = order_item_id
         and o.user_id = auth.uid()
    )
  );

-- Only on your own order, and only before it is paid: checkout inserts every
-- add-on row *before* place_order_escrow creates the payment, so the legit
-- flow passes. Once a payment row exists the total is locked, so blocking
-- later inserts stops a tampered client bolting on unpaid add-ons.
create policy "order_item_addons: insert via own unpaid order"
  on public.order_item_addons for insert
  with check (
    exists (
      select 1
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
       where oi.id = order_item_id
         and o.user_id = auth.uid()
    )
    and not exists (
      select 1
        from public.order_items oi
        join public.payments p on p.order_id = oi.order_id
       where oi.id = order_item_id
    )
  );

create policy "order_item_addons: vendor owner reads via own order"
  on public.order_item_addons for select
  using (
    exists (
      select 1
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        join public.vendors v on v.id = o.vendor_id
       where oi.id = order_item_id
         and v.owner_user_id = auth.uid()
    )
  );


-- ─── recompute_order_totals(): fold add-on money into the subtotal ───────────
create or replace function public.recompute_order_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_subtotal numeric;
begin
  select coalesce(sum(oi.quantity * (oi.unit_price + coalesce(a.addon_sum, 0))), 0)
    into v_subtotal
    from public.order_items oi
    left join (
      select order_item_id, sum(price) as addon_sum
        from public.order_item_addons
       group by order_item_id
    ) a on a.order_item_id = oi.id
   where oi.order_id = v_order_id;

  update public.orders
     set subtotal = v_subtotal,
         total_amount = v_subtotal + packaging_fee
   where id = v_order_id;

  return null;
end;
$$;

-- Same recompute, but reached from an order_item_addons row change — resolve
-- the parent order via order_items first.
create or replace function public.recompute_order_totals_for_addon()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_item_id uuid := coalesce(new.order_item_id, old.order_item_id);
  v_order_id      uuid;
  v_subtotal      numeric;
begin
  select order_id into v_order_id
    from public.order_items
   where id = v_order_item_id;

  if v_order_id is null then
    return null;
  end if;

  select coalesce(sum(oi.quantity * (oi.unit_price + coalesce(a.addon_sum, 0))), 0)
    into v_subtotal
    from public.order_items oi
    left join (
      select order_item_id, sum(price) as addon_sum
        from public.order_item_addons
       group by order_item_id
    ) a on a.order_item_id = oi.id
   where oi.order_id = v_order_id;

  update public.orders
     set subtotal = v_subtotal,
         total_amount = v_subtotal + packaging_fee
   where id = v_order_id;

  return null;
end;
$$;

create trigger order_item_addons_recompute_order_totals
  after insert or update or delete on public.order_item_addons
  for each row execute procedure public.recompute_order_totals_for_addon();


-- ─── place_order_escrow(): enforce group min/max before debiting ─────────────
-- p_amount is still ignored (orders.total_amount, recomputed server-side from
-- order_items + order_item_addons, is authoritative — see
-- fix_escrow_rpc_ownership). New: every add-on group attached to an ordered
-- dish must have a selection count within [min_select, max_select].
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

  if exists (
    select 1
      from public.order_items oi
      join public.menu_item_addon_groups g on g.menu_item_id = oi.menu_item_id
      left join public.order_item_addons oia
        on oia.order_item_id = oi.id
       and oia.addon_id in (
         select id from public.menu_item_addons where group_id = g.id
       )
     where oi.order_id = p_order_id
     group by oi.id, g.id, g.min_select, g.max_select
    having count(oia.id) < g.min_select
        or (g.max_select is not null and count(oia.id) > g.max_select)
  ) then
    raise exception 'addon_rule_violation';
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


-- ─── function execute grants (mirror harden_function_execute_grants) ─────────
revoke execute on function public.set_addon_group_vendor_id()            from public, anon, authenticated;
revoke execute on function public.set_addon_vendor_id()                  from public, anon, authenticated;
revoke execute on function public.enforce_order_item_addon_snapshot()    from public, anon, authenticated;
revoke execute on function public.recompute_order_totals_for_addon()     from public, anon, authenticated;
