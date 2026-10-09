-- Yogurt/milk drinks list dairy ingredients but had empty allergens, so dairy-allergic
-- students got no Add-to-Cart warning.
update public.menu_items
set allergens = array_append(coalesce(allergens, '{}'), 'dairy')
where ingredients && array['yogurt','milk']::text[]
  and not ('dairy' = any(coalesce(allergens, '{}')));
