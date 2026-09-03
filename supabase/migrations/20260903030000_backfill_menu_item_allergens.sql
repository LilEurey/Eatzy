-- Backfill menu_items.allergens from the already-populated ingredients array.
--
-- 502 of 510 menu_items rows had allergens = '{}', so the warn-before-add allergy
-- gate (src/app/item/[id].tsx confirmAddToCart -> matchAllergens in
-- src/hooks/usePreferences.ts) never fired for the real KMUTT catalog -- only the
-- 10-item "Everything Kitchen" demo vendor was ever hand-tagged. Root cause: the
-- KMUTT seed migrations populated ingredients but never allergens.
--
-- Derivation is a fixed, high-precision per-ingredient lookup. Every matched term
-- is a real value from the 66 distinct menu_items.ingredients entries as of
-- 2026-09-03. Output strings match ALLERGY_VALUES / ALLERGEN_VOCAB in
-- src/lib/allergy-options.ts, so matchAllergens' exact-string membership test
-- matches with no normalisation layer.
--
-- Deliberately NOT mapped: coconut / coconut milk (plant-based, not dairy);
-- fish / fish sauce (not in the shellfish vocabulary, and in nearly every Thai
-- savoury dish -- tagging it would train students to dismiss the warning); bare
-- "noodles" / "rice noodles" (rice noodles are gluten-free; only "egg noodles"
-- is mapped, to eggs).
--
-- Only rows with allergens = '{}' are touched, so the hand-tagged Everything
-- Kitchen rows are preserved. Re-running is a no-op.

update public.menu_items as m
set allergens = (
  select coalesce(array_agg(distinct tag order by tag), '{}')
  from unnest(m.ingredients) as ing
  cross join lateral (
    select case
      when ing in ('milk/cocoa', 'condensed milk', 'evaporated milk') then 'dairy'
      when ing in ('egg', 'egg noodles') then 'eggs'
      when ing in ('shrimp', 'dried shrimp', 'seafood') then 'shellfish'
      when ing = 'peanuts' then 'peanuts'
      when ing = 'tahini' then 'sesame'
      when ing in ('tofu', 'vegetable/tofu', 'soy sauce') then 'soy'
      when ing = 'beef' then 'beef'
      else null
    end as tag
  ) as t
  where t.tag is not null
)
where m.allergens = '{}'
  and exists (
    select 1
    from unnest(m.ingredients) as ing
    where ing in (
      'milk/cocoa', 'condensed milk', 'evaporated milk',
      'egg', 'egg noodles',
      'shrimp', 'dried shrimp', 'seafood',
      'peanuts',
      'tahini',
      'tofu', 'vegetable/tofu', 'soy sauce',
      'beef'
    )
  );

-- Drift guard: if a future ingredients-vocabulary change stops this lookup from
-- matching anything, fail the migration loudly rather than ship a silent no-op.
do $$
declare
  tagged_count int;
begin
  select count(*) into tagged_count
  from public.menu_items
  where allergens <> '{}';

  if tagged_count < 100 then
    raise exception
      'backfill_menu_item_allergens: only % rows have non-empty allergens after backfill (expected >= 100); ingredients vocabulary may have drifted',
      tagged_count;
  end if;
end $$;
