-- Migration: reseed_som_tam_dashboard_data
-- Malee's Thai Kitchen was the only stall with seeded dashboard data
-- (orders/payments/wallet_transactions), but it's permanently owned by the
-- Phase-1 password-login demo account (manager@maleethai.eatzy.app), which
-- lost its UI login path once vendor-login.tsx was deleted for Google-only
-- vendor auth. A freshly Google-approved vendor otherwise lands on an empty
-- dashboard.
--
-- Som Tam Station (e4ac8c58-5e24-4496-895e-d52cd553fc69) was claimed through
-- the real apply-vendor-application / approve-vendor-application flow by a
-- new demo account (manager@somtam.eatzy.app, owner_user_id
-- f2cfd030-c2e4-4518-a9bb-4527d4fa1dba) — same code path a real
-- Google-signed-in vendor goes through, just without an actual browser OAuth
-- click (no browser automation available). This migration seeds the same
-- order-status coverage Malee's had (2 pending, 1 accepted, 1 ready, 1
-- completed) against Som Tam Station's two existing menu items.
--
-- Wrapped in one do block using the same transaction-scoped
-- app.bypass_role_guard bypass 20260812010000 used — the direct
-- wallet_balance updates below would otherwise be blocked by
-- prevent_privileged_self_update, a trigger added after the original
-- 20260804 seed (which predates the trigger and never needed the bypass).

do $$
begin
  perform set_config('app.bypass_role_guard', 'on', true);

  -- Top up the two demo customers so the new order debits below don't run
  -- their balances negative — same "top up before ordering" story the
  -- original seed's balances implied.
  insert into public.wallet_transactions (user_id, type, amount, reference, description)
  values
    ('3371dde3-8543-4b19-859e-3ecb40e3b925', 'topup', 400, null, 'Demo wallet top-up'),
    ('d08451a7-e38e-4d98-87fc-3082b7742751', 'topup', 200, null, 'Demo wallet top-up');

  update public.users set wallet_balance = wallet_balance + 400 where id = '3371dde3-8543-4b19-859e-3ecb40e3b925';
  update public.users set wallet_balance = wallet_balance + 200 where id = 'd08451a7-e38e-4d98-87fc-3082b7742751';

  insert into public.orders (id, user_id, vendor_id, queue_number, status, subtotal, packaging_fee, total_amount, payment_method, pickup_start, pickup_end, time_segment, created_at)
  values
    ('a0ee1fe4-d182-4f4f-9f10-08f48650e540', '3371dde3-8543-4b19-859e-3ecb40e3b925', 'e4ac8c58-5e24-4496-895e-d52cd553fc69',
     21, 'pending', 70, 5, 75, 'wallet', now() + interval '20 minutes', now() + interval '35 minutes', 'lunch', now() - interval '30 seconds'),
    ('95660a72-5d4e-4aa2-8f0a-6e0f97e9a29b', 'd08451a7-e38e-4d98-87fc-3082b7742751', 'e4ac8c58-5e24-4496-895e-d52cd553fc69',
     22, 'pending', 115, 5, 120, 'wallet', now() + interval '25 minutes', now() + interval '40 minutes', 'lunch', now() - interval '90 seconds'),
    ('a435b612-51ff-440e-bd78-8edce48842fc', '3371dde3-8543-4b19-859e-3ecb40e3b925', 'e4ac8c58-5e24-4496-895e-d52cd553fc69',
     18, 'accepted', 160, 5, 165, 'wallet', now() + interval '10 minutes', now() + interval '25 minutes', 'lunch', now() - interval '5 minutes'),
    ('cbc2523c-b2c4-42ca-b82d-d39a8fb936e6', 'd08451a7-e38e-4d98-87fc-3082b7742751', 'e4ac8c58-5e24-4496-895e-d52cd553fc69',
     17, 'ready', 45, 5, 50, 'wallet', now() - interval '3 minutes', now() + interval '2 minutes', 'lunch', now() - interval '12 minutes'),
    ('53372e1b-22f5-4708-aa7a-4a33b2b531f3', '3371dde3-8543-4b19-859e-3ecb40e3b925', 'e4ac8c58-5e24-4496-895e-d52cd553fc69',
     14, 'completed', 115, 5, 120, 'wallet', now() - interval '2 days', now() - interval '2 days' + interval '15 minutes', 'lunch', now() - interval '2 days');

  insert into public.order_items (order_id, menu_item_id, quantity, unit_price)
  values
    ('a0ee1fe4-d182-4f4f-9f10-08f48650e540', '29021208-81e4-4a3f-bf23-def79c76061a', 1, 70),

    ('95660a72-5d4e-4aa2-8f0a-6e0f97e9a29b', '2f3cfbf4-300a-4cfc-a916-601baa2ddac0', 1, 45),
    ('95660a72-5d4e-4aa2-8f0a-6e0f97e9a29b', '29021208-81e4-4a3f-bf23-def79c76061a', 1, 70),

    ('a435b612-51ff-440e-bd78-8edce48842fc', '2f3cfbf4-300a-4cfc-a916-601baa2ddac0', 2, 45),
    ('a435b612-51ff-440e-bd78-8edce48842fc', '29021208-81e4-4a3f-bf23-def79c76061a', 1, 70),

    ('cbc2523c-b2c4-42ca-b82d-d39a8fb936e6', '2f3cfbf4-300a-4cfc-a916-601baa2ddac0', 1, 45),

    ('53372e1b-22f5-4708-aa7a-4a33b2b531f3', '29021208-81e4-4a3f-bf23-def79c76061a', 1, 70),
    ('53372e1b-22f5-4708-aa7a-4a33b2b531f3', '2f3cfbf4-300a-4cfc-a916-601baa2ddac0', 1, 45);

  insert into public.payments (order_id, amount, method, status, paid_at)
  values
    ('a0ee1fe4-d182-4f4f-9f10-08f48650e540', 75,  'wallet', 'pending', null),
    ('95660a72-5d4e-4aa2-8f0a-6e0f97e9a29b', 120, 'wallet', 'pending', null),
    ('a435b612-51ff-440e-bd78-8edce48842fc', 165, 'wallet', 'pending', null),
    ('cbc2523c-b2c4-42ca-b82d-d39a8fb936e6', 50,  'wallet', 'pending', null),
    ('53372e1b-22f5-4708-aa7a-4a33b2b531f3', 120, 'wallet', 'completed', now() - interval '2 days' + interval '20 minutes');

  insert into public.wallet_transactions (user_id, type, amount, reference, description)
  values
    ('3371dde3-8543-4b19-859e-3ecb40e3b925', 'payment', -75,  'a0ee1fe4-d182-4f4f-9f10-08f48650e540', 'Order payment held in escrow'),
    ('d08451a7-e38e-4d98-87fc-3082b7742751', 'payment', -120, '95660a72-5d4e-4aa2-8f0a-6e0f97e9a29b', 'Order payment held in escrow'),
    ('3371dde3-8543-4b19-859e-3ecb40e3b925', 'payment', -165, 'a435b612-51ff-440e-bd78-8edce48842fc', 'Order payment held in escrow'),
    ('d08451a7-e38e-4d98-87fc-3082b7742751', 'payment', -50,  'cbc2523c-b2c4-42ca-b82d-d39a8fb936e6', 'Order payment held in escrow'),
    ('3371dde3-8543-4b19-859e-3ecb40e3b925', 'payment', -120, '53372e1b-22f5-4708-aa7a-4a33b2b531f3', 'Order payment held in escrow');

  update public.users set wallet_balance = wallet_balance - 75  where id = '3371dde3-8543-4b19-859e-3ecb40e3b925';
  update public.users set wallet_balance = wallet_balance - 120 where id = 'd08451a7-e38e-4d98-87fc-3082b7742751';
  update public.users set wallet_balance = wallet_balance - 165 where id = '3371dde3-8543-4b19-859e-3ecb40e3b925';
  update public.users set wallet_balance = wallet_balance - 50  where id = 'd08451a7-e38e-4d98-87fc-3082b7742751';
  update public.users set wallet_balance = wallet_balance - 120 where id = '3371dde3-8543-4b19-859e-3ecb40e3b925';

  -- Escrow release for the completed order, same pattern the original seed
  -- used for Malee's manager.
  update public.users
     set wallet_balance = wallet_balance + 120
   where id = 'f2cfd030-c2e4-4518-a9bb-4527d4fa1dba';

  insert into public.wallet_transactions (user_id, type, amount, reference, description)
  values
    ('f2cfd030-c2e4-4518-a9bb-4527d4fa1dba', 'transfer', 120, '53372e1b-22f5-4708-aa7a-4a33b2b531f3', 'Escrow released for completed order');
end $$;
