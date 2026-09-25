-- open_time/close_time were display-only: a stall left toggled open kept
-- taking orders after closing. A stall is now orderable only when the vendor
-- toggle is on AND Bangkok time is inside its hours. Missing hours = no limit;
-- close < open = overnight window. Mirrored client-side by isWithinOpenHours()
-- in src/lib/time.ts.
create or replace function public.within_open_hours(p_open time, p_close time)
returns boolean
language sql stable
set search_path = ''
as $$
  select case
    when p_open is null or p_close is null or p_open = p_close then true
    when p_open < p_close then (now() at time zone 'Asia/Bangkok')::time >= p_open
                            and (now() at time zone 'Asia/Bangkok')::time <  p_close
    else (now() at time zone 'Asia/Bangkok')::time >= p_open
      or (now() at time zone 'Asia/Bangkok')::time <  p_close
  end;
$$;

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
  v_open      time;
  v_close     time;
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
  select is_open, open_time, close_time into v_is_open, v_open, v_close from public.vendors where id = p_vendor_id for update;
  if not found then
    raise exception 'vendor_not_found';
  end if;
  if not v_is_open or not public.within_open_hours(v_open, v_close) then
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
