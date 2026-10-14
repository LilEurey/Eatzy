-- One rating per order. The rate screen used to upsert, so the Rate button
-- (shown again after pickup and again after the vendor's handoff confirm)
-- let a student overwrite their review. With no UPDATE policy, a second
-- submit hits unique (user_id, menu_item_id, order_id) and fails.
drop policy if exists "ratings: update own" on public.ratings;
