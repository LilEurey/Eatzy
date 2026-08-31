-- Migration: remove_euro_test_vendor
-- Dev-testing cleanup: hard-deletes the "Euro" stall and its owner account.
-- It was created at runtime via the admin new-vendor flow (the only vendor
-- with owner_user_id set), not by any seed migration, so it does not belong
-- in the app's real KMUTT vendor list.
--
-- Cascades: menu_items / ratings / promotions / ml_interactions cascade off
-- vendors and menu_items; public.users / user_preferences / notifications
-- cascade off auth.users. orders / payments / wallet_transactions are
-- "on delete restrict", so any rows tied to this vendor or owner are removed
-- first (there are none today — the account never transacted — but the
-- explicit deletes keep this safe if that changes before it is pushed).

do $$
declare
  v_vendor_id constant uuid := 'b6b1a6b0-9c2e-4a3f-8a1e-3f6d2a9c7e10';
  v_owner_id  constant uuid := '3027ebec-5fbf-4976-b2e7-33d2402742a2';
begin
  if not exists (select 1 from public.vendors where id = v_vendor_id) then
    raise notice 'Euro vendor % already gone — nothing to do.', v_vendor_id;
    return;
  end if;

  -- restrict-guarded rows for this vendor's orders
  delete from public.payments
   where order_id in (select id from public.orders where vendor_id = v_vendor_id);
  delete from public.orders where vendor_id = v_vendor_id;

  -- restrict-guarded rows for the owner acting as a student
  delete from public.payments
   where order_id in (select id from public.orders where user_id = v_owner_id);
  delete from public.orders where user_id = v_owner_id;
  delete from public.wallet_transactions where user_id = v_owner_id;

  -- vendor row: cascades menu_items, ratings, promotions, ml_interactions
  delete from public.vendors where id = v_vendor_id;

  -- owner account: cascades public.users, user_preferences, notifications
  delete from auth.users where id = v_owner_id;
end $$;
