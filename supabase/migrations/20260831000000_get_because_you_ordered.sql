-- Because You Ordered: collaborative filtering via item co-occurrence, same
-- approach as ml/recommend.py's because_you_ordered() — peers are users who
-- share at least one item with the caller ANYWHERE in their order history,
-- and candidates are everything those peers ordered (across all their
-- orders, not just the matching one) that the caller hasn't ordered.
-- orders/order_items RLS scopes each student to their own rows, so this
-- needs SECURITY DEFINER to see peers' orders — but unlike
-- get_trending_items (a public aggregate), this returns personalized
-- results, so it takes no user_id argument at all and reads auth.uid()
-- internally. That means the DB — not the caller — decides whose history
-- this runs against; there is no id to spoof.
create or replace function public.get_because_you_ordered(limit_n int)
returns table (menu_item_id uuid, co_orders bigint)
language sql
security definer
set search_path = ''
as $$
  with mine as (
    select distinct oi.menu_item_id
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.user_id = (select auth.uid())
  ),
  peers as (
    -- other users who ordered at least one of "mine" at some point
    select distinct o.user_id
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.menu_item_id in (select menu_item_id from mine)
      and o.user_id is distinct from (select auth.uid())
  )
  select oi.menu_item_id, count(distinct o.user_id) as co_orders
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.user_id in (select user_id from peers)
    and oi.menu_item_id not in (select menu_item_id from mine)
  group by oi.menu_item_id
  order by co_orders desc
  limit limit_n;
$$;

-- Personalized (reads the caller's own order history via auth.uid()) — like
-- the other per-user RPCs, authenticated only. Anonymous callers have no
-- auth.uid(), so 'mine' is empty and this returns zero rows either way.
revoke execute on function public.get_because_you_ordered(int) from public, anon;
grant execute on function public.get_because_you_ordered(int) to authenticated;
