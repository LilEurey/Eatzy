-- "N orders ahead of you" on the track screen. orders RLS ("orders: student
-- reads own") scopes SELECT to the caller's own rows, so counting sibling
-- orders for the same vendor needs SECURITY DEFINER — it only ever returns
-- a count, never other students' order rows. Ordered by created_at, not
-- queue_number: next_queue_number() is a non-atomic select max()+1, racy
-- under concurrent inserts for the same vendor.
create or replace function public.get_orders_ahead(p_order_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid;
  v_created_at timestamptz;
  v_status text;
  v_ahead int;
begin
  select vendor_id, created_at, status
    into v_vendor_id, v_created_at, v_status
    from public.orders
   where id = p_order_id
     and user_id = auth.uid();

  if v_vendor_id is null then
    return null;
  end if;

  if v_status not in ('pending', 'accepted') then
    return null;
  end if;

  select count(*)
    into v_ahead
    from public.orders
   where vendor_id = v_vendor_id
     and status in ('pending', 'accepted')
     and created_at < v_created_at;

  return v_ahead;
end;
$$;

revoke execute on function public.get_orders_ahead(uuid) from public;
grant execute on function public.get_orders_ahead(uuid) to authenticated;
