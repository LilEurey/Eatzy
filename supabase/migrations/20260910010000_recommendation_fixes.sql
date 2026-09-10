-- Recommendation pipeline fixes — three defects found auditing the ML and
-- non-ML ranking surfaces together:
--
--   1. Latest Release goes permanently empty. Nothing ever set
--      menu_items.release_date, so every seeded row inherited the column
--      default (current_date at seed time) and the whole catalog shares one
--      date. Home's "released in the last 7 days" window therefore matches
--      everything for a week and then nothing, forever.
--   2. get_trending_items counted cancelled and rejected orders as demand,
--      and counted order_items *rows* instead of quantities.
--   3. get_because_you_ordered built its peer set from those same dead
--      orders.

-- ─── 1. Give the seeded catalog a real release_date spread ───────────────────
-- Only touches rows that are part of a bulk insert — a date shared by more
-- than 20 items is a seed batch, never organic vendor activity. Genuinely new
-- vendor-added items (which land on today's date, alone or nearly so) keep
-- theirs. That also makes this re-runnable: after the update no date holds
-- more than a handful of rows, so a second run is a no-op.
--
-- The offset is a deterministic hash of the item id, so the same catalog
-- always produces the same ordering — a demo doesn't reshuffle between runs.
with bulk_dates as (
  select release_date
  from public.menu_items
  group by release_date
  having count(*) > 20
)
update public.menu_items m
   set release_date = current_date
     - (('x' || substr(md5(m.id::text), 1, 8))::bit(32)::bigint % 120)::int
 where m.release_date in (select release_date from bulk_dates);

-- ─── 2. Trending: real demand only, weighted by quantity ─────────────────────
-- status filter: an order that was rejected or cancelled is not evidence that
-- anyone wants the dish, and 'pending' hasn't been accepted yet so it may
-- still become 'rejected'. Only accepted/ready/completed count.
-- sum(quantity): ordering 10 portions is ten times the signal of ordering one;
-- count(*) treated both as a single order line.
create or replace function public.get_trending_items(since timestamptz, limit_n int)
returns table (menu_item_id uuid, order_count bigint)
language sql
security definer
set search_path = ''
as $$
  select oi.menu_item_id, sum(oi.quantity)::bigint as order_count
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.created_at >= greatest(since, now() - interval '30 days')
    and o.status in ('accepted', 'ready', 'completed')
  group by oi.menu_item_id
  -- menu_item_id breaks ties so a re-run of the same window returns the same
  -- top-N; without it Postgres is free to reorder equal counts, and at campus
  -- volume most candidates tie.
  order by order_count desc, oi.menu_item_id
  limit least(coalesce(limit_n, 10), 50);
$$;

revoke execute on function public.get_trending_items(timestamptz, int) from public;
grant execute on function public.get_trending_items(timestamptz, int) to anon, authenticated;

-- ─── 3. Because You Ordered: same status filter, all three passes ────────────
-- "mine" must not include a dish from an order the vendor rejected (the
-- student never ate it), peers must not be strangers linked by a cancelled
-- order, and the candidate counts must not be inflated by either.
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
      and o.status in ('accepted', 'ready', 'completed')
  ),
  peers as (
    -- other users who ordered at least one of "mine" at some point
    select distinct o.user_id
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.menu_item_id in (select menu_item_id from mine)
      and o.user_id is distinct from (select auth.uid())
      and o.status in ('accepted', 'ready', 'completed')
  )
  select oi.menu_item_id, count(distinct o.user_id) as co_orders
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.user_id in (select user_id from peers)
    and o.status in ('accepted', 'ready', 'completed')
    and oi.menu_item_id not in (select menu_item_id from mine)
  group by oi.menu_item_id
  order by co_orders desc, oi.menu_item_id
  limit least(coalesce(limit_n, 10), 50);
$$;

revoke execute on function public.get_because_you_ordered(int) from public, anon;
grant execute on function public.get_because_you_ordered(int) to authenticated;

-- Both functions now filter on (created_at, status) / (status) before
-- aggregating; the existing orders_user_id_idx and orders_vendor_id_created_idx
-- don't cover that pair.
create index if not exists orders_created_at_status_idx on public.orders (created_at, status);

-- Latest Release orders by release_date desc over the whole available catalog
-- now that the 7-day window is gone (see (tabs)/index.tsx).
create index if not exists menu_items_release_date_idx
  on public.menu_items (release_date desc) where is_available;
