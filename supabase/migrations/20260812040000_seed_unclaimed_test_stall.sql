-- Migration: seed_unclaimed_test_stall
-- All 4 existing vendors are currently claimed (owner_user_id set) — Malee's
-- and Som Tam Station have live demo dashboard data attached, so freeing
-- either would break that. /vendor-apply's stall picker needs at least one
-- unclaimed stall to be testable at all (empty list otherwise falls into the
-- noStalls copy and a permanently disabled submit button). Add a fifth,
-- dedicated test stall instead of touching the existing four.

insert into public.vendors (id, name, stall_number, is_halal_certified, open_time, close_time, is_open, bio, cuisine_tags, estimated_wait_min, current_queue_count, owner_user_id)
values
  ('b6b1a6b0-9c2e-4a3f-8a1e-3f6d2a9c7e10', 'Boat Noodle Corner', 'E4', false, '09:00', '18:00', true,
   'Small-batch boat noodles, the way street vendors serve them back home.',
   array['Thai','Noodles','Street Food'], 6, 0, null)
on conflict (id) do nothing;
