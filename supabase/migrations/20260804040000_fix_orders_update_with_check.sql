-- Migration: fix_orders_update_with_check
-- An UPDATE policy with no explicit WITH CHECK defaults to reusing its USING
-- clause as the WITH CHECK — so both existing student UPDATE policies on
-- orders were silently rejecting the very transition they exist for:
--   "student cancels own pending"   USING status = 'pending' -> blocks
--                                    setting status to 'cancelled'
--   "student picks up own ready"    USING status = 'ready'   -> blocks
--                                    setting status to 'completed'
-- Found via an end-to-end smoke test of the real pickup flow. Both need an
-- explicit WITH CHECK that only re-asserts ownership, not the old status.

alter policy "orders: student cancels own pending"
  on public.orders
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id);

alter policy "orders: student picks up own ready order"
  on public.orders
  using (auth.uid() = user_id and status = 'ready')
  with check (auth.uid() = user_id);
