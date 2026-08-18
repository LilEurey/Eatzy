-- Migration: close_other_vendors_for_dev_testing
-- Dev-testing aid: home screen (`(tabs)/index.tsx`) only lists vendors with
-- is_open = true, so closing every stall except pochvasin.p@gmail.com's
-- "Everything Kitchen" (seeded in 20260815010000_seed_everything_vendor.sql,
-- carries the full 10-item catalog) makes it the only stall a student sees,
-- without deleting the other seeded vendors/orders/history.
-- Reversible: flip is_open back to true per vendor to restore them.

do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = 'pochvasin.p@gmail.com';

  if v_user_id is null then
    raise exception 'No auth.users row for pochvasin.p@gmail.com yet — run 20260815010000_seed_everything_vendor.sql first.';
  end if;

  update public.vendors
     set is_open = false
   where owner_user_id is distinct from v_user_id;
end $$;
