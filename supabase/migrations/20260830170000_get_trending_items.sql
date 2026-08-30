-- Trending Meals Today: rank menu_items by real order volume in a recent
-- window. orders/order_items RLS scopes each student to their own rows, so
-- this aggregate needs SECURITY DEFINER to count across all students —
-- it only ever returns item ids + counts, never order/user rows themselves.
create or replace function public.get_trending_items(since timestamptz, limit_n int)
returns table (menu_item_id uuid, order_count bigint)
language sql
security definer
set search_path = ''
as $$
  select oi.menu_item_id, count(*) as order_count
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.created_at >= since
  group by oi.menu_item_id
  order by order_count desc
  limit limit_n;
$$;

-- Read-only aggregate over public catalog data — safe for anon (browsing
-- the home screen doesn't require login) and authenticated alike.
revoke execute on function public.get_trending_items(timestamptz, int) from public;
grant execute on function public.get_trending_items(timestamptz, int) to anon, authenticated;
