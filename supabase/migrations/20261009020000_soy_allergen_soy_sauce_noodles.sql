-- Stir-Fried Rice Noodles with Soy Sauce lists soy sauce but had no allergens,
-- so the soy allergy warning never fired.
update public.menu_items
set allergens = array(select distinct unnest(allergens || array['soy']::text[]))
where id = '6cf0adeb-b380-4f0a-b8fa-692a0f7e66eb';
