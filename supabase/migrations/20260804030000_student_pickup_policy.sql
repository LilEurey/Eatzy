-- Migration: student_pickup_policy
-- The only existing student update policy on orders scopes to
-- status = 'pending' (cancel flow) — a student marking their own ready
-- order as picked up ("I've picked it up" in track/[id].tsx) needs a
-- separate policy scoped to status = 'ready'.

create policy "orders: student picks up own ready order"
  on public.orders for update
  using (auth.uid() = user_id and status = 'ready');
