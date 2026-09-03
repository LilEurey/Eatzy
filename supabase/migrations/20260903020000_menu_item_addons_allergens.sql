-- Add allergen tags to add-on options.
--
-- The warn-before-add popup (item/[id].tsx) and the new warn-before-checkout
-- popup (cart.tsx) so far only looked at the base dish's menu_items.allergens.
-- An add-on like "Fried Egg" or "Extra Peanuts" could carry an allergen the
-- base dish doesn't, and the student was never warned. Same shape and default
-- as menu_items.allergens.

alter table public.menu_item_addons
  add column allergens text[] not null default '{}';
