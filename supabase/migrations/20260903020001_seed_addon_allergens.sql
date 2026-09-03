-- Tag the obvious allergen add-ons seeded in 20260831040001_seed_menu_addons
-- so the allergy warnings demo end to end: a student with an egg allergy who
-- adds "Fried Egg" / "Onsen Egg" to an otherwise egg-free dish now gets the
-- warn-before-add and warn-before-checkout confirms.
--
-- Idempotent — only touches options still at the default '{}'. Uses the same
-- canonical tag ('eggs') as user_preferences.allergies / menu_items.allergens.

update public.menu_item_addons
   set allergens = '{eggs}'
 where name in ('Onsen Egg', 'Fried Egg')
   and allergens = '{}';
