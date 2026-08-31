-- Seed add-on groups + options onto a handful of popular seeded KMUTT dishes
-- so the feature demos without vendor setup. vendor_id is filled by the
-- set_addon_group_vendor_id / set_addon_vendor_id triggers. Idempotent:
-- skips a group that already exists for the same dish + name.

-- 1. Groups, resolved to menu_items by (vendor name, item name).
insert into public.menu_item_addon_groups (menu_item_id, name, name_th, min_select, max_select, sort_order)
select mi.id, g.name, g.name_th, g.min_select, g.max_select, g.sort_order
from (
  values
  ('Dino Papa',         'Korean Fried Chicken Rice',    'Extras',      'ท็อปปิ้งเพิ่ม',  0, 3, 1),
  ('Fahsai Restaurant', 'Fried Chicken Rice',           'Spice Level', 'ระดับความเผ็ด',  1, 1, 0),
  ('Fahsai Restaurant', 'Fried Chicken Rice',           'Extras',      'ท็อปปิ้งเพิ่ม',  0, 2, 1),
  ('Fahsai Restaurant', 'Grilled Chicken',              'Portion',     'ขนาด',           1, 1, 0),
  ('Fahsai Restaurant', 'Tonkatsu Fried Pork Rice',     'Sauce',       'ซอส',            1, 1, 0),
  ('Fahsai Restaurant', 'Tonkatsu Fried Pork Rice',     'Extras',      'ท็อปปิ้งเพิ่ม',  0, 2, 1),
  ('Fahsai Restaurant', 'Bonchon Fried Chicken Rice',   'Extras',      'ท็อปปิ้งเพิ่ม',  0, 3, 1)
) as g(vendor_name, item_name, name, name_th, min_select, max_select, sort_order)
join public.vendors vd on vd.name = g.vendor_name
join public.menu_items mi on mi.vendor_id = vd.id and mi.name = g.item_name
where not exists (
  select 1 from public.menu_item_addon_groups x
   where x.menu_item_id = mi.id and x.name = g.name
);

-- 2. Options, resolved to the group by (vendor name, item name, group name).
insert into public.menu_item_addons (group_id, name, name_th, price, sort_order)
select grp.id, o.name, o.name_th, o.price, o.sort_order
from (
  values
  ('Dino Papa',         'Korean Fried Chicken Rice',  'Extras',      'Onsen Egg',      'ไข่ออนเซ็น',   15, 0),
  ('Dino Papa',         'Korean Fried Chicken Rice',  'Extras',      'Kimchi',         'กิมจิ',         15, 1),
  ('Dino Papa',         'Korean Fried Chicken Rice',  'Extras',      'Extra Rice',     'ข้าวเพิ่ม',     10, 2),
  ('Fahsai Restaurant', 'Fried Chicken Rice',         'Spice Level', 'Mild',           'ไม่เผ็ด',        0, 0),
  ('Fahsai Restaurant', 'Fried Chicken Rice',         'Spice Level', 'Medium',         'เผ็ดปานกลาง',    0, 1),
  ('Fahsai Restaurant', 'Fried Chicken Rice',         'Spice Level', 'Thai Hot',       'เผ็ดมาก',        0, 2),
  ('Fahsai Restaurant', 'Fried Chicken Rice',         'Extras',      'Fried Egg',      'ไข่ดาว',        10, 0),
  ('Fahsai Restaurant', 'Fried Chicken Rice',         'Extras',      'Extra Rice',     'ข้าวเพิ่ม',     10, 1),
  ('Fahsai Restaurant', 'Grilled Chicken',            'Portion',     'Regular',        'ปกติ',           0, 0),
  ('Fahsai Restaurant', 'Grilled Chicken',            'Portion',     'Large',          'พิเศษ',         20, 1),
  ('Fahsai Restaurant', 'Tonkatsu Fried Pork Rice',   'Sauce',       'Tonkatsu Sauce', 'ซอสทงคัตสึ',     0, 0),
  ('Fahsai Restaurant', 'Tonkatsu Fried Pork Rice',   'Sauce',       'Japanese Curry', 'แกงกะหรี่',     10, 1),
  ('Fahsai Restaurant', 'Tonkatsu Fried Pork Rice',   'Extras',      'Fried Egg',      'ไข่ดาว',        10, 0),
  ('Fahsai Restaurant', 'Tonkatsu Fried Pork Rice',   'Extras',      'Extra Rice',     'ข้าวเพิ่ม',     10, 1),
  ('Fahsai Restaurant', 'Bonchon Fried Chicken Rice', 'Extras',      'Fried Egg',      'ไข่ดาว',        10, 0),
  ('Fahsai Restaurant', 'Bonchon Fried Chicken Rice', 'Extras',      'Extra Rice',     'ข้าวเพิ่ม',     10, 1),
  ('Fahsai Restaurant', 'Bonchon Fried Chicken Rice', 'Extras',      'Pickled Radish', 'หัวไชโป๊ว',      5, 2)
) as o(vendor_name, item_name, group_name, name, name_th, price, sort_order)
join public.vendors vd on vd.name = o.vendor_name
join public.menu_items mi on mi.vendor_id = vd.id and mi.name = o.item_name
join public.menu_item_addon_groups grp on grp.menu_item_id = mi.id and grp.name = o.group_name
where not exists (
  select 1 from public.menu_item_addons x
   where x.group_id = grp.id and x.name = o.name
);
