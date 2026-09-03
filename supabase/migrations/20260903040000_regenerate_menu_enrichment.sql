-- Regenerate menu_items.ingredients / .tags for the ~500 KMUTT rows, then
-- re-derive allergens.
--
-- Root cause of the gap this fixes: 20260902010000_enrich_menu_item_ingredients_tags
-- is a static UPDATE ... FROM (VALUES ...) keyed on menu_items.id, but the KMUTT
-- seed (20260830152020) inserts rows with no explicit id, so ids are
-- gen_random_uuid() and differ on every apply. Its 500 hardcoded uuids match
-- nothing on a fresh database -- confirmed: 0 matches, 500/510 rows left with a
-- single-word ingredients array and tags = '{}'. That collapses the TF-IDF
-- vocabulary the recommend-similar / recommend-for-you edge functions build from
-- ingredients + tags + category, so same-category items score cosine ~= 1.0.
-- Editing that migration cannot help a live DB (already in schema_migrations);
-- this new migration supersedes its effect.
--
-- This derivation is deterministic and id-free: each field is computed from the
-- row's own name/description/category/spice_level/dietary flags. Scoped to
-- tags = '{}', so the 10 hand-curated "Everything Kitchen" demo rows (already
-- tagged) are untouched, and a re-run is a no-op.
--
-- Accepted imprecision: the `milk` keyword is a plain substring, so ~4 rows whose
-- text says "coconut milk" gain the `milk` ingredient term and, via Statement 3,
-- a {dairy} allergen tag -- contrary to 20260903030000's deliberate exclusion of
-- coconut milk from dairy. 32 of the 36 `milk`-matching KMUTT rows are genuine
-- dairy drinks, and a false {dairy} warning on a coconut drink is the harmless
-- direction for an allergy gate. `cream` is deliberately not a keyword: "creamy"
-- here is a coconut-milk texture word (~20 rows, ~0 real dairy cream).

do $$
declare
  ing_updated int;
  tag_updated int;
  bad_rows int;
  allergen_updated int;
  missing text;
begin
  ----------------------------------------------------------------------------
  -- Statement 1: ingredients from a keyword substring scan
  ----------------------------------------------------------------------------
  update public.menu_items as m
  set ingredients = coalesce(
    nullif(
      ( select array_agg(distinct k.term order by k.term)
        from (values
          ('pork','pork'), ('chicken','chicken'), ('beef','beef'), ('fish','fish'),
          ('shrimp','shrimp'), ('prawn','shrimp'), ('crab','crab'), ('squid','squid'),
          ('seafood','seafood'), ('bacon','bacon'), ('ham','ham'), ('sausage','sausage'),
          ('meatball','meatball'), ('wonton','wonton'), ('tofu','tofu'), ('egg','egg'),
          ('omelet','egg'), ('rice','rice'), ('noodle','noodles'), ('vermicelli','vermicelli'),
          ('bread','bread'), ('sticky rice','sticky rice'), ('milk','milk'), ('cheese','cheese'),
          ('yogurt','milk'), ('yoghurt','milk'), ('condensed milk','milk'),
          ('evaporated milk','milk'), ('cocoa','cocoa'), ('chocolate','cocoa'),
          ('coffee','coffee'), ('espresso','coffee'), ('tea','tea'), ('boba','boba'),
          ('bubble','boba'), ('coconut','coconut'), ('garlic','garlic'), ('chili','chili'),
          ('chilli','chili'), ('basil','basil'), ('lime','lime'), ('lemon','lemon'),
          ('onion','onion'), ('tomato','tomato'), ('cucumber','cucumber'), ('papaya','papaya'),
          ('mango','mango'), ('banana','banana'), ('pineapple','pineapple'), ('orange','orange'),
          ('strawberry','strawberry'), ('grape','grape'), ('kiwi','kiwi'), ('lychee','lychee'),
          ('watermelon','watermelon'), ('melon','melon'), ('passion fruit','passion fruit'),
          ('apple','apple'), ('corn','corn'), ('mushroom','mushroom'), ('cabbage','cabbage'),
          ('lettuce','lettuce'), ('sweet potato','sweet potato'), ('potato','potato'),
          ('taro','taro'), ('pumpkin','pumpkin'), ('eggplant','eggplant'),
          ('broccoli','broccoli'), ('bean sprout','bean sprouts'), ('quinoa','quinoa'),
          ('avocado','avocado'), ('chickpea','chickpeas'), ('peanut','peanut'),
          ('sesame','sesame'), ('tahini','sesame'), ('mayo','mayo'), ('soy sauce','soy sauce'),
          ('fish sauce','fish sauce'), ('oyster sauce','oyster sauce'), ('curry','curry'),
          ('syrup','syrup'), ('honey','honey'), ('sugar','sugar'), ('kimchi','kimchi'),
          ('ginger','ginger'), ('lemongrass','lemongrass'), ('galangal','galangal'),
          ('tamarind','tamarind'), ('pandan','pandan')
        ) as k(needle, term)
        where position(k.needle in lower(m.name || ' ' || coalesce(m.description,'') || ' ' || m.category)) > 0
      ),
      '{}'
    ),
    m.ingredients
  )
  where m.tags = '{}';
  get diagnostics ing_updated = row_count;
  raise notice 'regenerate_menu_enrichment: ingredients updated on % rows', ing_updated;

  ----------------------------------------------------------------------------
  -- Statement 2: tags from dietary flags + spice + category slug + keywords
  ----------------------------------------------------------------------------
  update public.menu_items as m
  set tags = (
    select coalesce(array_agg(distinct tg order by tg), array['mild'])
    from (
      select 'halal'::text as tg where m.is_halal
      union all select 'vegetarian' where m.is_vegetarian
      union all select 'jay' where m.is_jay
      union all select case when m.spice_level <= 2 then 'mild' else 'spicy' end
      union all select case m.category
        when 'Main Dishes (Rice)' then 'main-dishes-rice'
        when 'Rice Dishes'        then 'main-dishes-rice'
        when 'Beverages'          then 'beverages'
        when 'Drinks'             then 'beverages'
        when 'Noodles'            then 'noodles'
        when 'Appetizers'         then 'appetizers'
        when 'Main Dishes'        then 'main-dishes'
        when 'Add-ons'            then 'add-ons'
        when 'Desserts'           then 'desserts'
        when 'Soup'               then 'soup'
        when 'Salads'             then 'salad'
        when 'Grilled'            then 'grilled'
        when 'Curry'              then 'main-dishes'
        when 'Bowls'              then 'main-dishes'
        else null
      end
      union all
      select tw.term
      from (values
        ('stir-fr','stir-fried'), ('stir fr','stir-fried'), ('deep-fr','deep-fried'),
        ('deep fr','deep-fried'), ('fried','fried'), ('crispy','crispy'), ('crisp','crispy'),
        ('grill','grilled'), ('roast','roasted'), ('steam','steamed'), ('boil','boiled'),
        ('bake','baked'), ('iced','iced'), ('hot ','hot'), ('sweet','sweet'), ('spicy','spicy'),
        ('smoothie','smoothie'), ('blended','smoothie'), ('salad','salad'), ('soup','soup'),
        ('broth','soup'), ('curry','curry'), ('noodle','noodles'), ('thai','thai'),
        ('chinese','chinese'), ('korean','korean'), ('japanese','japanese'),
        ('italian','italian'), ('isaan','isaan'), ('esan','isaan')
      ) as tw(needle, term)
      where position(tw.needle in lower(m.name || ' ' || coalesce(m.description,'') || ' ' || m.category)) > 0
    ) s
    where tg is not null
  )
  where m.tags = '{}';
  get diagnostics tag_updated = row_count;
  raise notice 'regenerate_menu_enrichment: tags updated on % rows', tag_updated;

  ----------------------------------------------------------------------------
  -- Guard: no target row left thin
  ----------------------------------------------------------------------------
  select count(*) into bad_rows
  from public.menu_items
  where cardinality(ingredients) < 1 or cardinality(tags) < 2;
  if bad_rows > 0 then
    raise exception
      'regenerate_menu_enrichment: % row(s) ended with <1 ingredient or <2 tags', bad_rows;
  end if;

  ----------------------------------------------------------------------------
  -- Statement 3: re-derive allergens (verbatim from
  -- 20260903030000_backfill_menu_item_allergens.sql, now that ingredients are rich)
  ----------------------------------------------------------------------------
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
  get diagnostics allergen_updated = row_count;
  raise notice 'regenerate_menu_enrichment: allergens re-derived on % rows', allergen_updated;

  if allergen_updated = 0 then
    raise exception
      'regenerate_menu_enrichment: allergen re-derive touched 0 rows; ingredients vocabulary has drifted';
  end if;

  select string_agg(t, ', ') into missing
  from unnest(array['dairy', 'eggs', 'shellfish', 'beef', 'soy']) as t
  where not exists (select 1 from public.menu_items where t = any(allergens));
  if missing is not null then
    raise exception
      'regenerate_menu_enrichment: no rows tagged for [%]; ingredients vocabulary has drifted', missing;
  end if;
end $$;
