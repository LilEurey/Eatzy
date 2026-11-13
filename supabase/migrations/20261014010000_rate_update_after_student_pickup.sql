-- Match "ratings: update own" to the relaxed insert policy (20261014000000).
-- rate/[id].tsx upserts, so re-rating before the vendor confirms handoff took
-- the update path and still demanded status = 'completed'.
alter policy "ratings: update own"
  on public.ratings
  using (auth.uid() = user_id)
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
