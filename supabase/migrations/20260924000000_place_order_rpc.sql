-- Migration: place_order_rpc
-- Findings from the 2026-09-24 full-codebase audit.
--
-- Order placement used to be 3+N client round-trips (next_queue_number →
-- insert orders → insert order_items ×N → insert order_item_addons), with a
-- "compensating" client delete on failure. There is no DELETE policy on
-- orders, so that delete was a silent 0-row no-op: a failed item insert left
-- a pending order with zero items whose total_amount was still the
-- client-sent cart total, and accept_order_and_charge would charge it.
-- The client also chose created_at, queue_number and pickup_start/end, and
-- nothing stopped a sold-out dish (or another stall's dish) being ordered.
--
-- place_order() does the whole thing in one transaction and owns every rule
-- the client used to be trusted with. Direct client INSERTs on orders /
-- order_items / order_item_addons are removed, which also closes the race
-- where order_items could be inserted while accept_order_and_charge was
-- charging the order.

-- ─── place_order ──────────────────────────────────────────────────────────────
-- p_lines: [{ "menu_item_id": uuid, "quantity": int, "note": text|null,
--             "addon_ids": [uuid, ...] }, ...]
create or replace function public.place_order(
  p_vendor_id    uuid,
  p_lines        jsonb,
  p_pickup_start timestamptz,
  p_pickup_end   timestamptz
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_is_open   boolean;
  v_queue     int;
  v_order_id  uuid;
  v_item_id   uuid;
  v_line      jsonb;
  v_qty       int;
  v_hour      int;
  v_segment   text;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Bangkok')) at time zone 'Asia/Bangkok';
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- Only students order. A vendor's wallet_balance mirrors earnings that are
  -- also paid out through Stripe, so it must not be spendable at other stalls.
  if not exists (select 1 from public.users where id = v_user_id and role = 'student') then
    raise exception 'not_a_student';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty_order';
  end if;

  if p_pickup_start is null or p_pickup_end is null
     or p_pickup_end <= p_pickup_start
     or p_pickup_start < now() - interval '5 minutes'
     or p_pickup_end > now() + interval '12 hours' then
    raise exception 'invalid_pickup_window';
  end if;

  -- Row lock serializes queue numbers per stall (max()+1 below) and reads
  -- is_open under the same lock.
  select is_open into v_is_open from public.vendors where id = p_vendor_id for update;
  if not found then
    raise exception 'vendor_not_found';
  end if;
  if not v_is_open then
    raise exception 'vendor_closed' using errcode = 'check_violation';
  end if;

  -- Daily reset at Bangkok midnight, not the server's UTC midnight.
  select coalesce(max(queue_number), 0) + 1
    into v_queue
    from public.orders
   where vendor_id = p_vendor_id
     and created_at >= v_day_start
     and status <> 'cancelled';

  v_hour := extract(hour from p_pickup_start at time zone 'Asia/Bangkok');
  v_segment := case when v_hour < 11 then 'breakfast' when v_hour < 17 then 'lunch' else 'dinner' end;

  -- subtotal/total_amount start at 0 and are recomputed by
  -- order_items_recompute_order_totals as lines go in.
  insert into public.orders (
    user_id, vendor_id, queue_number, status, subtotal, total_amount,
    payment_method, pickup_start, pickup_end, time_segment
  ) values (
    v_user_id, p_vendor_id, v_queue, 'pending', 0, 0,
    'wallet', p_pickup_start, p_pickup_end, v_segment
  )
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'invalid_quantity';
    end if;

    -- unit_price, vendor match and availability are enforced by
    -- order_items_enforce_price.
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price, special_instructions)
    values (
      v_order_id,
      (v_line->>'menu_item_id')::uuid,
      v_qty,
      0,
      nullif(btrim(coalesce(v_line->>'note', '')), '')
    )
    returning id into v_item_id;

    -- name/price snapshot, dish match and availability are enforced by
    -- order_item_addons_enforce_snapshot.
    insert into public.order_item_addons (order_item_id, addon_id, name, price)
    select v_item_id, a.value::uuid, '', 0
      from jsonb_array_elements_text(coalesce(v_line->'addon_ids', '[]'::jsonb)) a;
  end loop;

  -- Same min/max rule accept_order_and_charge re-checks at charge time; failing
  -- here means the student sees it at checkout instead of a stuck order.
  if exists (
    select 1
      from public.order_items oi
      join public.menu_item_addon_groups g on g.menu_item_id = oi.menu_item_id
      left join public.order_item_addons oia
        on oia.order_item_id = oi.id
       and oia.addon_id in (select id from public.menu_item_addons where group_id = g.id)
     where oi.order_id = v_order_id
     group by oi.id, g.id, g.min_select, g.max_select
    having count(oia.id) < g.min_select
        or (g.max_select is not null and count(oia.id) > g.max_select)
  ) then
    raise exception 'addon_rule_violation';
  end if;

  return v_order_id;
end;
$$;

revoke execute on function public.place_order(uuid, jsonb, timestamptz, timestamptz) from public, anon;
grant execute on function public.place_order(uuid, jsonb, timestamptz, timestamptz) to authenticated;

-- ─── Line-item triggers: vendor match + availability ─────────────────────────
create or replace function public.enforce_order_item_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_item_vendor  uuid;
  v_available    boolean;
  v_order_vendor uuid;
begin
  select price, vendor_id, is_available
    into new.unit_price, v_item_vendor, v_available
    from public.menu_items
   where id = new.menu_item_id;

  if new.unit_price is null then
    raise exception 'menu_item_not_found';
  end if;

  select vendor_id into v_order_vendor from public.orders where id = new.order_id;
  if v_item_vendor is distinct from v_order_vendor then
    raise exception 'item_not_from_vendor';
  end if;

  if not v_available then
    raise exception 'item_unavailable';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_order_item_addon_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_line_menu_item_id  uuid;
  v_addon_menu_item_id uuid;
  v_available          boolean;
begin
  if new.addon_id is null then
    raise exception 'addon_not_found';
  end if;

  select mi.name, mi.name_th, mi.price, g.menu_item_id, mi.is_available
    into new.name, new.name_th, new.price, v_addon_menu_item_id, v_available
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

  if not v_available then
    raise exception 'addon_unavailable';
  end if;

  return new;
end;
$$;

-- ─── No more direct client inserts ───────────────────────────────────────────
drop policy if exists "orders: student inserts own" on public.orders;
drop policy if exists "order_items: insert via own unpaid order" on public.order_items;
drop policy if exists "order_item_addons: insert via own unpaid order" on public.order_item_addons;

-- Only place-order.ts called it; place_order() computes the number itself.
drop function if exists public.next_queue_number(uuid);

-- ─── Vendor "new order" notification: fire at commit, read the real total ────
-- As an AFTER INSERT row trigger it ran before any order_items existed and
-- snapshotted the (then client-supplied) total_amount. Deferred to commit, it
-- sees the total recompute_order_totals produced.
create or replace function public.notify_vendor_new_order()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_queue    int;
  v_total    numeric;
begin
  select owner_user_id into v_owner_id from public.vendors where id = new.vendor_id;
  if v_owner_id is null then
    return new;
  end if;

  if not (select notifications_enabled from public.users where id = v_owner_id) then
    return new;
  end if;

  select queue_number, total_amount into v_queue, v_total from public.orders where id = new.id;
  if not found then
    return new;
  end if;

  insert into public.notifications (user_id, order_id, type, icon, title, body, event, queue_number, total_amount)
  values (
    v_owner_id,
    new.id,
    'order',
    '🛎️',
    'New order!',
    'Queue #' || coalesce(v_queue::text, '—') || ' · ฿' || v_total::text,
    'vendor_new_order',
    v_queue,
    v_total
  );

  return new;
end;
$$;

revoke execute on function public.notify_vendor_new_order() from public, anon, authenticated;

drop trigger if exists order_notify_vendor on public.orders;
create constraint trigger order_notify_vendor
  after insert on public.orders
  deferrable initially deferred
  for each row
  execute function public.notify_vendor_new_order();
