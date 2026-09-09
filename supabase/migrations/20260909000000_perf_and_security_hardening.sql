-- Migration: perf_and_security_hardening
-- Three independent, additive fixes found in a full-codebase audit. Removes
-- no feature — only adds indexes and tightens two write policies + one RPC.
--
--   1. Missing FK indexes. Postgres auto-indexes PK + UNIQUE only. Every RLS
--      policy on orders/order_items/ratings runs an `exists (select 1 from
--      orders where ...)` / join on an unindexed FK column, so each policy
--      check is a seq scan today. These are the columns those subqueries and
--      the app's own list queries filter on.
--
--   2. orders INSERT policy pinned to status='pending'. "orders: student
--      inserts own" only asserted auth.uid() = user_id. A client bypassing
--      the app UI could insert a row with status='accepted' or 'ready',
--      skipping accept_order_and_charge() — the ONLY wallet-charge point
--      since 20260904010000_charge_on_vendor_accept. That's free food. Line
--      prices/totals are already recomputed by triggers; this closes the
--      status hole. Also forbid pre-setting the handoff timestamps.
--
--   3. ratings INSERT policy requires a real completed order of that item.
--      "ratings: insert own" only checked auth.uid() = user_id. order_id is
--      nullable and client-supplied, and unique(user_id,menu_item_id,order_id)
--      does not dedupe when order_id is NULL (SQL NULLs compare distinct), so
--      a scripted client could post unlimited scores on any menu_item —
--      poisoning Trending, Because-You-Ordered, and the public rating shown
--      on the store screen. Require the rating to reference the caller's own
--      completed order that actually contained the item.
--
--   4. get_trending_items: anon-callable (home screen needs no login) with a
--      caller-supplied `since` and an unbounded `limit_n` — an unauthenticated
--      full-scan aggregate on demand. Clamp both.

-- ─── 1. FK indexes on the RLS / list-query hot path ──────────────────────────
create index if not exists orders_user_id_idx          on public.orders (user_id);
create index if not exists orders_vendor_id_created_idx on public.orders (vendor_id, created_at);
create index if not exists order_items_order_id_idx     on public.order_items (order_id);
create index if not exists order_items_menu_item_id_idx on public.order_items (menu_item_id);
create index if not exists menu_items_vendor_id_idx     on public.menu_items (vendor_id);
create index if not exists ratings_menu_item_id_idx     on public.ratings (menu_item_id);
create index if not exists wallet_tx_user_created_idx   on public.wallet_transactions (user_id, created_at);

-- ─── 2. Orders can only be inserted in the 'pending' state ───────────────────
alter policy "orders: student inserts own"
  on public.orders
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and vendor_handed_off_at is null
    and student_picked_up_at is null
  );

-- ─── 3. A rating must reference the caller's own completed order of the item ──
alter policy "ratings: insert own"
  on public.ratings
  with check (
    auth.uid() = user_id
    and exists (
      select 1
        from public.orders o
        join public.order_items oi on oi.order_id = o.id
       where o.id = ratings.order_id
         and o.user_id = auth.uid()
         and o.status = 'completed'
         and oi.menu_item_id = ratings.menu_item_id
    )
  );

-- ─── 4. Clamp the anon-reachable trending aggregate ─────────────────────────
create or replace function public.get_trending_items(since timestamptz, limit_n int)
returns table (menu_item_id uuid, order_count bigint)
language sql
security definer
set search_path = ''
as $$
  select oi.menu_item_id, count(*) as order_count
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.created_at >= greatest(since, now() - interval '30 days')
  group by oi.menu_item_id
  order by order_count desc
  limit least(coalesce(limit_n, 10), 50);
$$;
