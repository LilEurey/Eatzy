-- New dish from the 2026-10-07 menu collection CSV (only item not already in the catalog).
insert into public.menu_items
  (vendor_id, name, name_th, description, price, category, is_halal, is_vegetarian, is_jay, allergens, tags, ingredients)
select v.id,
  'Stir-Fried Yellow Curry Powder on Rice', 'ผัดผงกะหรี่',
  'Stir-fried choice of meat with yellow curry powder, egg, and onions over rice',
  45, 'Main Dishes (Rice)', false, false, false,
  array['egg'],
  array['stir-fried','mild','main-dishes-rice'],
  array['chicken','pork','rice','curry','egg','onion']
from public.vendors v
where v.name = 'Sai Nua Kitchen'
  and not exists (select 1 from public.menu_items m
                  where m.vendor_id = v.id and m.name = 'Stir-Fried Yellow Curry Powder on Rice');

-- Dietary-flag corrections from the same CSV (2026-10-07 audit): the DB had these wrong.
update public.menu_items m set is_halal = false
  from public.vendors v where m.vendor_id = v.id and v.name = 'Krua Thai' and m.name = 'Hawaiian Ham Burger';
update public.menu_items m set is_vegetarian = false, is_jay = false
  from public.vendors v where m.vendor_id = v.id and (v.name, m.name) in (
    ('Uncle Chicky', 'Clear Soup Noodles'), ('Uncle Chicky', 'Tom Yum Noodles'),
    ('P'' Pom', 'Fried Meatballs'), ('Mr.Mouslache', 'Fried Rice'));
update public.menu_items m set is_jay = false
  from public.vendors v where m.vendor_id = v.id and v.name = 'P'' Mee' and m.name = 'Custard Cream Bun (1 Piece)';
