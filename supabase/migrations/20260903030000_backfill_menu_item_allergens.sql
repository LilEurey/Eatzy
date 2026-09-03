-- Backfill menu_items.allergens from the already-populated ingredients array.
--
-- 502 of 510 menu_items rows had allergens = '{}', so the warn-before-add allergy
-- gate (src/app/item/[id].tsx confirmAddToCart -> matchAllergens in
-- src/hooks/usePreferences.ts) never fired for the real KMUTT catalog -- only the
-- 10-item "Everything Kitchen" demo vendor was ever hand-tagged. Root cause: the
-- KMUTT seed migrations populated ingredients but never allergens.
--
-- Derivation is a fixed, high-precision ingredient -> allergen lookup (the
-- `mappable` CTE below). It is a SUPERSET spanning both ingredient vocabularies
-- present across environments: the original 20260830152020 seed vocabulary
-- (milk/cocoa, condensed milk, egg noodles, dried shrimp, tahini, vegetable/tofu,
-- peanuts) AND the 20260902010000 enrichment vocabulary (milk, cream, cheese,
-- peanut, sesame, crab, squid, mayo, bread). The two term sets are disjoint, so
-- every row is tagged correctly whichever vocabulary its ingredients use. Output
-- strings match ALLERGY_VALUES / ALLERGEN_VOCAB in src/lib/allergy-options.ts, so
-- matchAllergens' exact-string membership test matches with no normalisation.
--
-- Deliberately NOT mapped: coconut / coconut milk (plant-based, not dairy);
-- fish / fish sauce (not in the shellfish vocabulary, and in nearly every Thai
-- savoury dish -- tagging it would train students to dismiss the warning); bare
-- "noodles" / "rice noodles" / "vermicelli" (rice noodles are gluten-free; only
-- "egg noodles" -> eggs and "bread" -> gluten are mapped); "desserts" /
-- "bakery/dessert" (ambiguous -- many Thai desserts are coconut/rice/agar based
-- and gluten-free; deferred rather than over-warn).
--
-- Only rows with allergens = '{}' are touched, so the hand-tagged Everything
-- Kitchen rows are preserved. Re-running is a no-op.

do $$
declare
  updated_count int;
  missing text;
begin
  with mappable(ingredient, tag) as (
    values
      ('milk/cocoa', 'dairy'), ('condensed milk', 'dairy'), ('evaporated milk', 'dairy'),
      ('milk', 'dairy'), ('cream', 'dairy'), ('cheese', 'dairy'),
      ('egg', 'eggs'), ('egg noodles', 'eggs'), ('mayo', 'eggs'),
      ('shrimp', 'shellfish'), ('dried shrimp', 'shellfish'), ('seafood', 'shellfish'),
      ('crab', 'shellfish'), ('squid', 'shellfish'),
      ('peanuts', 'peanuts'), ('peanut', 'peanuts'),
      ('tahini', 'sesame'), ('sesame', 'sesame'),
      ('tofu', 'soy'), ('vegetable/tofu', 'soy'), ('soy sauce', 'soy'),
      ('beef', 'beef'),
      ('bread', 'gluten')
  )
  update public.menu_items as m
  set allergens = (
    select coalesce(array_agg(distinct mp.tag order by mp.tag), '{}')
    from unnest(m.ingredients) as u(ingredient)
    join mappable mp on mp.ingredient = u.ingredient
  )
  where m.allergens = '{}'
    and exists (
      select 1
      from unnest(m.ingredients) as u(ingredient)
      join mappable mp on mp.ingredient = u.ingredient
    );

  get diagnostics updated_count = row_count;
  raise notice 'backfill_menu_item_allergens: % rows updated', updated_count;

  -- Guard 1: the UPDATE must have touched at least one row. Zero means the
  -- ingredients vocabulary drifted out from under the lookup entirely.
  if updated_count = 0 then
    raise exception
      'backfill_menu_item_allergens: UPDATE touched 0 rows; ingredients vocabulary has drifted';
  end if;

  -- Guard 2: every allergen that maps from a COMMON ingredient term must end up
  -- on at least one row. Catches a partial vocabulary miss (e.g. dairy terms all
  -- absent) that Guard 1 would not. peanuts / sesame / gluten are intentionally
  -- excluded here -- they map from rare terms and a legitimately small catalog
  -- can have zero.
  select string_agg(t, ', ') into missing
  from unnest(array['dairy', 'eggs', 'shellfish', 'beef', 'soy']) as t
  where not exists (select 1 from public.menu_items where t = any(allergens));

  if missing is not null then
    raise exception
      'backfill_menu_item_allergens: no rows tagged for [%]; ingredients vocabulary has drifted', missing;
  end if;
end $$;
