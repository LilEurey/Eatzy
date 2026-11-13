-- Students rate right after confirming pickup; they no longer wait for the
-- vendor's handoff confirm. Payout still waits for both sides
-- (finalize_order_handoff) — only rating is relaxed.
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
         and (o.status = 'completed' or o.student_picked_up_at is not null)
         and oi.menu_item_id = ratings.menu_item_id
    )
  );
