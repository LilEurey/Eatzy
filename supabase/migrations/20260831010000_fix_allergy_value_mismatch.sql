-- The onboarding/edit-preferences allergy picker saved 'egg' and 'seafood'
-- (lowercased UI labels) into user_preferences.allergies, but vendor-entered
-- menu_items.allergens actually uses 'eggs' and 'shellfish' (verified against
-- live data: distinct allergens = dairy, soy, eggs, sesame, peanuts,
-- shellfish, gluten). The exact-string filter never matched, so anyone who
-- picked Egg or Seafood got zero real protection from it. The app-side fix
-- (ALLERGY_VALUES in src/lib/allergy-options.ts) only affects saves going
-- forward — this backfills rows saved before the fix.
update public.user_preferences
set allergies = (
  select array_agg(distinct case elem when 'egg' then 'eggs' when 'seafood' then 'shellfish' else elem end)
  from unnest(allergies) as elem
)
where 'egg' = any(allergies) or 'seafood' = any(allergies);
