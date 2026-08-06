-- Migration: fix_order_status_transitions
-- Both student UPDATE policies on orders only assert auth.uid() = user_id
-- in their WITH CHECK, with no status constraint. Postgres RLS combines
-- permissive policies independently for USING vs WITH CHECK, so a student
-- could take their own pending order (matches "cancels own pending"'s
-- USING) and set status to 'completed' directly (satisfies "picks up own
-- ready order"'s WITH CHECK, which imposes no status restriction) —
-- skipping the vendor's accept/prepare/ready workflow entirely. Pin each
-- policy's WITH CHECK to the one transition it's meant to allow.

alter policy "orders: student cancels own pending"
  on public.orders
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'cancelled');

alter policy "orders: student picks up own ready order"
  on public.orders
  using (auth.uid() = user_id and status = 'ready')
  with check (auth.uid() = user_id and status = 'completed');
