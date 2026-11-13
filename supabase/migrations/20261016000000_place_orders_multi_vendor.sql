-- Multi-store cart: one checkout places one order per stall, all or nothing.
-- Loops the existing place_order() inside a single transaction — any stall
-- failing (closed, sold out, bad window) rolls back every order in the call.
-- The failing stall's id rides in the error DETAIL so the client can name it;
-- the message stays place_order's code (vendor_closed, item_unavailable, ...).
create or replace function public.place_orders(
  p_orders       jsonb, -- [{ vendor_id, lines: <place_order p_lines> }]
  p_pickup_start timestamptz,
  p_pickup_end   timestamptz
)
returns uuid[]
language plpgsql security definer
set search_path = ''
as $$
declare
  v_order  jsonb;
  v_vendor uuid;
  v_ids    uuid[] := '{}';
begin
  if p_orders is null or jsonb_typeof(p_orders) <> 'array' or jsonb_array_length(p_orders) = 0 then
    raise exception 'empty_order';
  end if;
  if jsonb_array_length(p_orders) > 10 then
    raise exception 'too_many_vendors';
  end if;

  -- Sorted by vendor id so two concurrent checkouts lock vendor rows
  -- (place_order's FOR UPDATE) in the same order — no deadlock.
  for v_order in
    select value from jsonb_array_elements(p_orders) order by value->>'vendor_id'
  loop
    v_vendor := (v_order->>'vendor_id')::uuid;
    begin
      v_ids := v_ids || public.place_order(v_vendor, v_order->'lines', p_pickup_start, p_pickup_end);
    exception when others then
      raise exception '%', sqlerrm using errcode = sqlstate, detail = v_vendor::text;
    end;
  end loop;

  return v_ids;
end;
$$;

revoke execute on function public.place_orders(jsonb, timestamptz, timestamptz) from public, anon;
grant execute on function public.place_orders(jsonb, timestamptz, timestamptz) to authenticated;
