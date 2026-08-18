-- Migration: delete_other_vendors_for_dev_testing
-- Dev-testing aid: hard-deletes every vendor stall except
-- pochvasin.p@gmail.com's "Everything Kitchen" (superseding the earlier
-- is_open = false close-down in 20260818000000), so only one vendor exists
-- in the app at all. menu_items/ratings/promotions/vendor_applications
-- cascade off vendors; order_items cascade off orders; payments and orders
-- are "on delete restrict", so their rows for the deleted vendors' orders
-- must go first.

do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = 'pochvasin.p@gmail.com';

  if v_user_id is null then
    raise exception 'No auth.users row for pochvasin.p@gmail.com yet — run 20260815010000_seed_everything_vendor.sql first.';
  end if;

  delete from public.payments
   where order_id in (
     select o.id from public.orders o
     join public.vendors v on v.id = o.vendor_id
     where v.owner_user_id is distinct from v_user_id
   );

  delete from public.orders o
   using public.vendors v
   where v.id = o.vendor_id
     and v.owner_user_id is distinct from v_user_id;

  delete from public.vendors
   where owner_user_id is distinct from v_user_id;
end $$;
