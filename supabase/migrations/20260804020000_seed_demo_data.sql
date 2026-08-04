-- Migration: seed_demo_data
-- Seeds the vendor catalog (matching src/lib/mock-data.ts 1:1 for visual
-- continuity) plus a handful of realistic orders/payments so the vendor
-- dashboard and student app have real rows to show immediately. The three
-- auth.users this migration references were created beforehand via the
-- Supabase Admin API (not raw SQL — see project notes), and already have
-- matching public.users rows from the handle_new_user trigger:
--   e0a18bdd-d113-4e10-8158-d4b7fe6ee3ad  manager@maleethai.eatzy.app  (vendor manager)
--   3371dde3-8543-4b19-859e-3ecb40e3b925  demo.student1@eatzy.app     (synthetic demo customer)
--   d08451a7-e38e-4d98-87fc-3082b7742751  demo.student2@eatzy.app     (synthetic demo customer)

-- ─── vendors ─────────────────────────────────────────────────────────────────
insert into public.vendors (id, name, stall_number, is_halal_certified, open_time, close_time, is_open, bio, cuisine_tags, estimated_wait_min, current_queue_count, owner_user_id)
values
  ('f87c67e2-51cd-40a9-abdc-74c4bc5250ce', 'Malee''s Thai Kitchen', 'A1', true,  '08:00', '20:00', true,
   'Authentic Thai home cooking since 2015. Our recipes are passed down from generations of Thai grandmothers.',
   array['Thai','Rice Dishes','Curry'], 5, 2, 'e0a18bdd-d113-4e10-8158-d4b7fe6ee3ad'),
  ('e4ac8c58-5e24-4496-895e-d52cd553fc69', 'Som Tam Station', 'B3', false, '10:00', '19:00', true,
   'Isaan-style street food — fiery papaya salads, grilled chicken, and sticky rice straight from northeast Thailand.',
   array['Isaan','Grilled','Salads'], 8, 7, null),
  ('83e535a5-2163-4ac8-831b-4cc6713b8fe7', 'Mama Noodle House', 'C2', true,  '07:30', '15:00', true,
   'Fresh hand-pulled noodles and soups. Our tom yum broth simmers for 8 hours every morning before the stall opens.',
   array['Noodles','Soup','Chinese-Thai'], 12, 11, null),
  ('22c8f74a-1ace-4e51-8354-639824d70b6b', 'Green Harvest', 'D1', false, '08:00', '18:00', true,
   '100% plant-based bowls, smoothies, and wraps. Organic ingredients sourced from local farmers every morning.',
   array['Vegetarian','Vegan','Healthy'], 4, 1, null)
on conflict (id) do nothing;

update public.users set role = 'vendor' where id = 'e0a18bdd-d113-4e10-8158-d4b7fe6ee3ad';


-- ─── menu_items ──────────────────────────────────────────────────────────────
insert into public.menu_items (id, vendor_id, name, description, price, category, spice_level, is_halal, is_vegetarian, is_jay, allergens, tags, ingredients, calories, preparation_time_min, is_featured, available_time_segment)
values
  ('030d7f8e-8cca-4f50-88c3-83681e72b9ce', 'f87c67e2-51cd-40a9-abdc-74c4bc5250ce', 'Pad Thai',
   'Stir-fried rice noodles with egg, tofu, bean sprouts, and crushed peanuts in a classic tamarind sauce.',
   55, 'Noodles', 1, true, false, false, array['peanuts','eggs','shellfish'], array['popular','noodles'],
   array['rice noodles','egg','tofu','bean sprouts','peanuts','tamarind sauce'], 420, 8, true, 'all'),
  ('f2fc1907-0b02-4d85-b548-2a31c9f537cf', 'f87c67e2-51cd-40a9-abdc-74c4bc5250ce', 'Green Curry with Rice',
   'Creamy coconut green curry with Thai eggplant, basil leaves, and jasmine rice.',
   65, 'Curry', 3, true, false, false, array['shellfish'], array['spicy','curry'],
   array['coconut milk','green curry paste','chicken','Thai eggplant','basil','jasmine rice'], 560, 10, false, 'lunch'),
  ('f7e69d55-8ef8-49e8-a52a-798e399bdf68', 'f87c67e2-51cd-40a9-abdc-74c4bc5250ce', 'Khao Man Gai',
   'Tender poached chicken on fragrant ginger rice with sliced cucumber and a savory dipping sauce.',
   50, 'Rice Dishes', 0, true, false, false, array['soy'], array['mild','halal','popular'],
   array['chicken','jasmine rice','ginger','garlic','cucumber','soy sauce'], 480, 5, false, 'all'),
  ('14f6b73b-76d5-4d6c-a6ae-ed6aaf7b7d3a', 'f87c67e2-51cd-40a9-abdc-74c4bc5250ce', 'Thai Milk Tea',
   'Rich Thai-style iced tea brewed from orange pekoe, sweetened with condensed milk.',
   35, 'Drinks', 0, true, true, false, array['dairy'], array['drink','popular','cold'],
   array['Thai tea leaves','condensed milk','evaporated milk','sugar','ice'], 240, 3, false, 'all'),

  ('2f3cfbf4-300a-4cfc-a916-601baa2ddac0', 'e4ac8c58-5e24-4496-895e-d52cd553fc69', 'Som Tam Thai',
   'Classic green papaya salad with cherry tomatoes, green beans, peanuts, dried shrimp, and a fiery lime dressing.',
   45, 'Salads', 4, false, false, false, array['peanuts','shellfish'], array['spicy','isaan','salad'],
   array['green papaya','tomatoes','green beans','peanuts','dried shrimp','fish sauce','lime','chili'], 180, 6, false, 'lunch'),
  ('29021208-81e4-4a3f-bf23-def79c76061a', 'e4ac8c58-5e24-4496-895e-d52cd553fc69', 'Gai Yang Set',
   'Marinated charcoal-grilled chicken with sticky rice and spicy nam jim jeaw dipping sauce.',
   70, 'Grilled', 2, false, false, false, array[]::text[], array['grilled','isaan','hearty'],
   array['chicken','lemongrass','garlic','turmeric','sticky rice','fish sauce'], 620, 15, false, 'lunch'),

  ('a3a20486-4f58-4c3f-a711-99e2162c8c59', '83e535a5-2163-4ac8-831b-4cc6713b8fe7', 'Tom Yum Noodles',
   'Spicy lemongrass broth with rice noodles, mushrooms, shrimp, and fresh herbs.',
   60, 'Soup', 3, true, false, false, array['shellfish'], array['spicy','soup','noodles','popular'],
   array['rice noodles','shrimp','mushrooms','lemongrass','galangal','kaffir lime leaves','chili'], 340, 7, false, 'all'),
  ('f996ebbf-04a2-4dec-bc52-7cc395eb50b0', '83e535a5-2163-4ac8-831b-4cc6713b8fe7', 'Wonton Noodle Soup',
   'Clear pork broth with handmade wontons, springy egg noodles, and fresh bok choy.',
   55, 'Soup', 0, false, false, false, array['gluten','eggs'], array['mild','soup','noodles'],
   array['egg noodles','pork wonton','bok choy','pork broth','garlic','soy sauce'], 380, 8, false, 'breakfast'),

  ('2ed4c30e-4356-4117-beed-617e616f839f', '22c8f74a-1ace-4e51-8354-639824d70b6b', 'Buddha Bowl',
   'Quinoa base with roasted sweet potato, broccoli, avocado, chickpeas, and creamy tahini dressing.',
   85, 'Bowls', 0, false, true, true, array['sesame'], array['vegan','healthy','bowls'],
   array['quinoa','broccoli','sweet potato','avocado','chickpeas','tahini','lemon'], 490, 10, false, 'all'),
  ('0a43062d-a3b1-4533-accf-340ea5256adb', '22c8f74a-1ace-4e51-8354-639824d70b6b', 'Tropical Smoothie',
   'Mango, pineapple, and banana blended fresh with coconut milk. No added sugar.',
   40, 'Drinks', 0, false, true, true, array[]::text[], array['vegan','drink','healthy'],
   array['mango','pineapple','banana','coconut milk'], 220, 3, false, 'all')
on conflict (id) do nothing;


-- ─── demo customer wallet balances ─────────────────────────────────────────────
-- Set to what's left after the seeded orders below debited them, so the books
-- read consistently if anyone inspects these seed accounts.
update public.users set wallet_balance = 75  where id = '3371dde3-8543-4b19-859e-3ecb40e3b925';
update public.users set wallet_balance = 135 where id = 'd08451a7-e38e-4d98-87fc-3082b7742751';


-- ─── orders + order_items + payments ───────────────────────────────────────────
-- Two pending (just placed), one accepted (being prepared), one ready
-- (awaiting pickup), one completed (money already released to the vendor) —
-- covers every KDS column plus a real Payment History row.

insert into public.orders (id, user_id, vendor_id, queue_number, status, subtotal, packaging_fee, total_amount, payment_method, pickup_start, pickup_end, time_segment, created_at)
values
  ('6a0b6cfe-4899-4276-bf97-af29cf168328', '3371dde3-8543-4b19-859e-3ecb40e3b925', 'f87c67e2-51cd-40a9-abdc-74c4bc5250ce',
   16, 'pending', 50, 5, 55, 'wallet', now() + interval '20 minutes', now() + interval '35 minutes', 'lunch', now() - interval '30 seconds'),
  ('2adc1b9b-125d-4909-bd22-01ec93c65c71', 'd08451a7-e38e-4d98-87fc-3082b7742751', 'f87c67e2-51cd-40a9-abdc-74c4bc5250ce',
   17, 'pending', 100, 5, 105, 'wallet', now() + interval '25 minutes', now() + interval '40 minutes', 'lunch', now() - interval '90 seconds'),
  ('487fa997-9d82-4495-a148-bd458f2fe08e', '3371dde3-8543-4b19-859e-3ecb40e3b925', 'f87c67e2-51cd-40a9-abdc-74c4bc5250ce',
   12, 'accepted', 145, 5, 150, 'wallet', now() + interval '10 minutes', now() + interval '25 minutes', 'lunch', now() - interval '5 minutes'),
  ('be7d50d8-69de-4649-a25a-adcb9ec740cf', 'd08451a7-e38e-4d98-87fc-3082b7742751', 'f87c67e2-51cd-40a9-abdc-74c4bc5250ce',
   11, 'ready', 55, 5, 60, 'wallet', now() - interval '3 minutes', now() + interval '2 minutes', 'lunch', now() - interval '12 minutes'),
  ('f2f90c3d-9894-43c4-a51f-e8956f0d8c24', '3371dde3-8543-4b19-859e-3ecb40e3b925', 'f87c67e2-51cd-40a9-abdc-74c4bc5250ce',
   8, 'completed', 115, 5, 120, 'wallet', now() - interval '2 days', now() - interval '2 days' + interval '15 minutes', 'lunch', now() - interval '2 days')
on conflict (id) do nothing;

insert into public.order_items (order_id, menu_item_id, quantity, unit_price)
values
  ('6a0b6cfe-4899-4276-bf97-af29cf168328', 'f7e69d55-8ef8-49e8-a52a-798e399bdf68', 1, 50),

  ('2adc1b9b-125d-4909-bd22-01ec93c65c71', 'f2fc1907-0b02-4d85-b548-2a31c9f537cf', 1, 65),
  ('2adc1b9b-125d-4909-bd22-01ec93c65c71', '14f6b73b-76d5-4d6c-a6ae-ed6aaf7b7d3a', 1, 35),

  ('487fa997-9d82-4495-a148-bd458f2fe08e', '030d7f8e-8cca-4f50-88c3-83681e72b9ce', 2, 55),
  ('487fa997-9d82-4495-a148-bd458f2fe08e', '14f6b73b-76d5-4d6c-a6ae-ed6aaf7b7d3a', 1, 35),

  ('be7d50d8-69de-4649-a25a-adcb9ec740cf', '030d7f8e-8cca-4f50-88c3-83681e72b9ce', 1, 55),

  ('f2f90c3d-9894-43c4-a51f-e8956f0d8c24', 'f2fc1907-0b02-4d85-b548-2a31c9f537cf', 1, 65),
  ('f2f90c3d-9894-43c4-a51f-e8956f0d8c24', 'f7e69d55-8ef8-49e8-a52a-798e399bdf68', 1, 50);

insert into public.payments (order_id, amount, method, status, paid_at)
values
  ('6a0b6cfe-4899-4276-bf97-af29cf168328', 55,  'wallet', 'pending', null),
  ('2adc1b9b-125d-4909-bd22-01ec93c65c71', 105, 'wallet', 'pending', null),
  ('487fa997-9d82-4495-a148-bd458f2fe08e', 150, 'wallet', 'pending', null),
  ('be7d50d8-69de-4649-a25a-adcb9ec740cf', 60,  'wallet', 'pending', null),
  ('f2f90c3d-9894-43c4-a51f-e8956f0d8c24', 120, 'wallet', 'completed', now() - interval '2 days' + interval '20 minutes');

insert into public.wallet_transactions (user_id, type, amount, reference, description)
values
  ('3371dde3-8543-4b19-859e-3ecb40e3b925', 'payment', -55,  '6a0b6cfe-4899-4276-bf97-af29cf168328', 'Order payment held in escrow'),
  ('d08451a7-e38e-4d98-87fc-3082b7742751', 'payment', -105, '2adc1b9b-125d-4909-bd22-01ec93c65c71', 'Order payment held in escrow'),
  ('3371dde3-8543-4b19-859e-3ecb40e3b925', 'payment', -150, '487fa997-9d82-4495-a148-bd458f2fe08e', 'Order payment held in escrow'),
  ('d08451a7-e38e-4d98-87fc-3082b7742751', 'payment', -60,  'be7d50d8-69de-4649-a25a-adcb9ec740cf', 'Order payment held in escrow'),
  ('3371dde3-8543-4b19-859e-3ecb40e3b925', 'payment', -120, 'f2f90c3d-9894-43c4-a51f-e8956f0d8c24', 'Order payment held in escrow');

-- Simulate the completed order's escrow release directly (rather than calling
-- the RPC from a migration) so Finance/Payment History has one real
-- already-released row for the vendor manager to see.
update public.users
   set wallet_balance = wallet_balance + 120
 where id = 'e0a18bdd-d113-4e10-8158-d4b7fe6ee3ad';

insert into public.wallet_transactions (user_id, type, amount, reference, description)
values
  ('e0a18bdd-d113-4e10-8158-d4b7fe6ee3ad', 'transfer', 120, 'f2f90c3d-9894-43c4-a51f-e8956f0d8c24', 'Escrow released for completed order');
