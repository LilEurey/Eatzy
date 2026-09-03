# Regenerate menu_items enrichment in SQL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status: shipped (commit `52b9e27`).** Two review rounds changed the migration from the SQL below: statements are scoped to a `_regen_targets` temp table (not `tags = '{}'` re-evaluated per statement), `ingredients` floors to `array['other']` and the category `case` gains `else 'other'` for vendor-created rows, the `tea`/`apple` needles are space-anchored and `melon` dropped, Statement 3's `allergen_updated = 0` is a `notice` not an exception. See the spec's "Amendments during implementation" section and the migration file's header comment for the authoritative final form. Shipped numbers: 102 distinct ingredient terms, 41 tags, 97 rows allergen-re-derived.

**Goal:** Add one migration that regenerates `menu_items.ingredients` and `.tags` for the ~500 KMUTT rows deterministically from each row's own text, then re-derives `allergens`, replacing the effect of the broken uuid-keyed `20260902010000`.

**Architecture:** A single `DO $$ … $$` block with three set-based `UPDATE`s scoped to `WHERE tags = '{}'`: (1) `ingredients` from a `keyword(needle, term)` inline table substring-scanning `lower(name||' '||description||' '||category)`, with fallback to the existing value; (2) `tags` from dietary flags + `spice_level` + a `category` slug map + a `tagword(needle, term)` table; (3) the allergen `mappable` CTE `UPDATE` copied verbatim from `20260903030000`. A guard after (2) asserts every target row has ≥1 ingredient and ≥2 tags; (3) keeps its own `GET DIAGNOSTICS` + per-tag guards.

**Tech Stack:** Supabase / Postgres migration applied by the Supabase CLI. Local DB via the `supabase_db_Eatzy` Docker container. No app or test code changes.

## Global Constraints

- Migration filename: `supabase/migrations/20260903040000_regenerate_menu_enrichment.sql` — must sort after `20260903030000_backfill_menu_item_allergens.sql`.
- Every `UPDATE` is scoped `WHERE tags = '{}'` (Statements 1 & 2) — the ~500 KMUTT rows. The 10 "Everything Kitchen" demo rows already have `tags <> '{}'` and must stay byte-for-byte unchanged.
- `ingredients` must never be emptied: if a row matches no ingredient keyword, keep its existing `ingredients` (`coalesce(nullif(array_agg(...), '{}'), m.ingredients)`).
- Statement 3 is the allergen `mappable` CTE `UPDATE` + guards from `20260903030000_backfill_menu_item_allergens.sql`, copied verbatim (including its `('cream','dairy')` row, which is now inert but stays for an exact copy).
- `cream` is NOT an ingredient keyword (20 "creamy" coconut-texture false positives).
- Accepted imprecision: ~4 "coconut milk" rows gain `milk` → `{dairy}`. Documented in the header, not worked around.
- No changes to `matchAllergens`, `src/app/item/[id].tsx`, the `recommend-*` edge functions, `ml/recommend.py`, `20260902010000`, or any schema.
- Validated locally in a `BEGIN … ROLLBACK` transaction on 2026-09-03: 103 distinct `ingredients` terms, 41 distinct `tags`, Statement 3 re-derives 95 rows, allergen row-counts eggs 77 / shellfish 54 / dairy 52 / soy 18 / beef 17 / peanuts 8 / sesame 2 / gluten 1.
- Data-only migration — verified by SQL replay, no jest test.

---

### Task 1: The regeneration migration

**Files:**
- Create: `supabase/migrations/20260903040000_regenerate_menu_enrichment.sql`

**Interfaces:**
- Consumes: `public.menu_items` columns `name`, `description`, `category`, `spice_level`, `is_halal`, `is_vegetarian`, `is_jay`, `ingredients`, `tags`, `allergens`.
- Produces: `ingredients` + `tags` repopulated for the ~500 KMUTT rows; `allergens` extended for rows that gain a mappable ingredient. No later task depends on this.

- [ ] **Step 1: Capture the broken pre-state (the "failing test")**

Run:
```bash
docker exec -i supabase_db_Eatzy psql -U postgres -c "
select count(*) filter (where tags='{}') tags_empty,
       count(*) filter (where cardinality(ingredients)<=1) single_word_ing
from menu_items;
select count(distinct t) distinct_ingredients from (select unnest(ingredients) t from menu_items) x;"
```
Expected on a current DB (after the allergen branch merged, before this migration): `tags_empty` ≈ 500, `single_word_ing` ≈ 500, `distinct_ingredients` ≈ 20. This is the state the migration fixes.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260903040000_regenerate_menu_enrichment.sql` with exactly this content:

```sql
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
```

- [ ] **Step 3: Apply via a full replay**

The migration is scoped `WHERE tags = '{}'`; on the current local DB that is already true for the KMUTT rows, so `supabase migration up` would apply it directly. But verify with a clean replay so migration ordering is proven:
```bash
npx supabase db reset
```
Expected: replays every migration + seed, ending with `20260903040000_regenerate_menu_enrichment.sql`, no error, no `RAISE` from any guard. You should see the three `NOTICE` lines (`ingredients updated on ~500 rows`, `tags updated on ~500 rows`, `allergens re-derived on ~95 rows`).

- [ ] **Step 4: Verify**

```bash
docker exec -i supabase_db_Eatzy psql -U postgres -c "
select count(*) filter (where tags='{}') tags_empty from menu_items;
select count(distinct t) distinct_ingredients from (select unnest(ingredients) t from menu_items) x;
select count(distinct t) distinct_tags from (select unnest(tags) t from menu_items) x;
select unnest(allergens) a, count(*) from menu_items group by 1 order by 2 desc;
select name, ingredients, tags, allergens from menu_items
where name in ('Minced Pork Rice Soup with Egg',
               'Stir-Fried Rice Noodles with Soy Sauce and Chicken (Pad See Ew Chicken)',
               'Coconut Smoothie')
order by name;
select name, tags from menu_items where name = 'Pad Thai';"
```
Expected:
- `tags_empty = 0`.
- `distinct_ingredients` ≥ 90 (validated 103).
- `distinct_tags` ≥ 35 (validated 41).
- allergen counts: `eggs 77, shellfish 54, dairy 52, soy 18, beef 17, peanuts 8, sesame 2, gluten 1` (small variations acceptable; each of `dairy/eggs/shellfish/beef/soy` must be well above its pre-migration value — 24/23/43/12/9 — and none may drop below it).
- `Minced Pork Rice Soup with Egg` → `ingredients` ⊇ `{egg,garlic,pork,rice}`, `tags` ⊇ `{soup,mild}`.
- `Stir-Fried Rice Noodles with Soy Sauce and Chicken (Pad See Ew Chicken)` → `ingredients` ⊇ `{chicken,egg,noodles,rice,soy sauce}`, `tags` ⊇ `{stir-fried,noodles}`.
- `Coconut Smoothie` → `ingredients = {coconut}`, `tags` ⊇ `{smoothie,beverages,mild}`, `allergens = {}`.
- `Pad Thai` (demo row) → `tags` unchanged from its curated value (not `{}`), proving the `WHERE tags = '{}'` scope held.

- [ ] **Step 5: Verify idempotency**

Re-run just the migration's `DO $$ … $$` block a second time against the post-reset DB:
```bash
docker exec -i supabase_db_Eatzy psql -U postgres -f supabase/migrations/20260903040000_regenerate_menu_enrichment.sql
```
Expected: `NOTICE` lines report `ingredients updated on 0 rows` and `tags updated on 0 rows` (every KMUTT row now has `tags <> '{}'`). The allergen re-derive will report `0 rows` and then `RAISE EXCEPTION … touched 0 rows` — this is the same one-shot guard `20260903030000` carries and is expected on a manual re-run; Supabase never re-runs an applied migration. Note this in the report; it is not a defect.

- [ ] **Step 6: Regression check**

```bash
npm test
```
Expected: 5 suites pass, unchanged — this migration touches no test-covered code.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260903040000_regenerate_menu_enrichment.sql
git commit -m "$(cat <<'EOF'
fix(enrichment): regenerate menu ingredients/tags in SQL from row text

20260902010000 keyed a static VALUES list on menu_items.id, but the KMUTT
seed inserts with random uuids, so it matched 0 rows on any fresh DB -- 500
rows kept single-word ingredients and empty tags, collapsing the TF-IDF
vocabulary the recommender builds. This migration regenerates ingredients
(keyword substring scan of name+description+category) and tags (dietary +
spice + category slug + keyword scan) deterministically, id-free, scoped to
tags = '{}' so the curated demo rows are untouched, then re-derives allergens
verbatim from 20260903030000 now that ingredients are rich. Validated on a
full db reset: 103 distinct ingredient terms (was ~20), 41 tags, 95 rows
gain allergen coverage.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**
- Regenerate `ingredients` from row text (spec Statement 1) → Task 1 Step 2, `keyword` VALUES table verbatim. ✓
- Regenerate `tags` (spec Statement 2: dietary + spice + category slug + `tagword`) → Task 1 Step 2. ✓
- `cream` excluded (spec) → not in the `keyword` table; noted in header comment. ✓
- Re-derive `allergens` verbatim from `20260903030000` (spec Statement 3) → Task 1 Step 2, `mappable` CTE copied exactly incl. `('cream','dairy')`. ✓
- Guard: ≥1 ingredient, ≥2 tags (spec) → Task 1 Step 2 `bad_rows` check. ✓
- Scoped `WHERE tags = '{}'`, demo rows untouched (spec) → every `UPDATE` in Step 2; verified by the `Pad Thai` check in Step 4. ✓
- Idempotency / one-shot (spec) → Task 1 Step 5, with the expected re-run `RAISE` documented. ✓
- Ordering after `20260903030000` (spec) → filename `20260903040000`; Step 3 full replay proves it. ✓
- Coconut-milk imprecision accepted + documented (spec) → header comment in Step 2. ✓
- Measured numbers (spec Impact) → Task 1 Step 4 expected values. ✓
- No jest test; `npm test` regression only (spec Testing item 6) → Task 1 Step 6. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases". Full SQL and every command shown. ✓

**3. Type consistency:** Tag output slugs (`main-dishes-rice`, `beverages`, `noodles`, `appetizers`, `main-dishes`, `add-ons`, `desserts`, `soup`, `salad`, `grilled`) consistent between the spec's category map and Step 2's `case`. Allergen tag strings (`dairy/eggs/shellfish/peanuts/sesame/soy/beef/gluten`) identical to `20260903030000` and to Step 4's expectations. `keyword`/`tagword`/`mappable` column names used consistently. ✓
