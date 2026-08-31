-- Mark a hand-picked set of dishes as promoted (is_featured = true).
-- The home screen "Promoted" row queries menu_items WHERE is_featured = true
-- AND is_available = true (src/app/(tabs)/index.tsx). The KMUTT seed
-- (20260830152020_seed_kmutt_menu_items.sql) never sets is_featured, so the
-- column stayed at its default of false and the row was always empty.
--
-- Matched by vendor name + item name because the KMUTT seed assigns menu_items
-- ids via gen_random_uuid() -- there are no stable literal ids to target.

UPDATE public.menu_items AS mi
SET is_featured = true
FROM public.vendors AS v
WHERE mi.vendor_id = v.id
  AND (v.name, mi.name) IN (
    ('Dino Papa',         'Korean Fried Chicken Rice with Orange Sauce and Onsen Egg'),
    ('Fahsai Restaurant', 'Grilled Saba Fish Rice'),
    ('Uncle Chicky',      'Tom Yum Noodles'),
    ('Loong Noom Square', 'Milk Tea'),
    ('P'' Pom',           'Rice with Chicken and Cheese')
  );
