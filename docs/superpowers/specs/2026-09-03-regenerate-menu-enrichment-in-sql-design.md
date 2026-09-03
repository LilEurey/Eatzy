# Regenerate menu_items ingredients + tags in SQL

**Date:** 2026-09-03
**Status:** Approved, ready for implementation plan

## Problem

`supabase/migrations/20260902010000_enrich_menu_item_ingredients_tags.sql` is a static
`UPDATE ... FROM (VALUES (...))` keyed on `menu_items.id`. The KMUTT seed
(`20260830152020_seed_kmutt_menu_items.sql`) inserts menu rows **without an `id`**, so ids
come from `gen_random_uuid()` and differ on every apply. The 500 hardcoded uuids in the
enrichment migration match nothing except the single database they were captured from.

Confirmed on a fresh local `supabase db reset`: **0 of the enrichment's uuids match**, and
500 of 510 `menu_items` rows still have a single-word `ingredients` array and `tags = '{}'`
(only the 10 hand-curated "Everything Kitchen" demo rows carry real multi-term data).

Consequences:
- The TF-IDF vocabulary used by the `recommend-similar` and `recommend-for-you` edge
  functions (`ingredients + tags + category` per item) collapses to ~20 terms; same-category
  items become near-identical vectors and every "Similar Foods" / "Recommended For You"
  result scores cosine ≈ 1.0.
- The allergen backfill (`20260903030000_backfill_menu_item_allergens.sql`) reads
  `ingredients`; with only the sparse seed vocabulary present, its coverage is limited to
  what that vocabulary exposes.

Editing `20260902010000` cannot fix a live database — it is already recorded in
`schema_migrations` and will not re-run. The fix must be a **new** migration.

## Goal

A new migration that regenerates `ingredients` and `tags` for the ~500 KMUTT rows
**deterministically from each row's own text** (`name`, `description`, `category`,
`spice_level`, dietary flags) — no ids, no external data — then re-derives `allergens` so a
fresh `db reset` stays internally consistent.

### Non-goals

- Matching the exact term set the original offline curation produced. The recommender needs
  a richer, well-differentiated vocabulary per item; byte-parity with the old payload is not
  required.
- Touching the 10 "Everything Kitchen" demo rows (they already have curated multi-term data).
- Fixing `20260902010000` in place, or reverting it.
- Changing the `recommend-*` edge functions, `ml/recommend.py`, or any schema.
- Backfilling `menu_item_addons`.

## Approach

New migration `supabase/migrations/20260903040000_regenerate_menu_enrichment.sql`. Three
statements, each a set-based `UPDATE` scoped to `WHERE tags = '{}'` (the ~500 KMUTT rows;
leaves the 10 demo rows and anything already enriched):

### Statement 1 — `ingredients`

A `keyword(term, needle)` inline `VALUES` table. For each target row, set `ingredients` to
the sorted-distinct set of `term`s whose `needle` appears (case-insensitive substring) in
`lower(name || ' ' || coalesce(description,'') || ' ' || category)`. If a row matches no
keyword, fall back to its existing `ingredients` (the seed's single word) so the array is
never emptied.

```
ingredients = coalesce(
  nullif( (select array_agg(distinct k.term order by k.term)
           from keyword k
           where position(k.needle in doc) > 0), '{}' ),
  m.ingredients )
```
where `doc = lower(m.name || ' ' || coalesce(m.description,'') || ' ' || m.category)`.

**Keyword table** (`needle` → `term`; needles lowercase; multiple needles may map to one
term). Proteins & mains: `pork`→pork, `chicken`→chicken, `beef`→beef, `fish`→fish,
`shrimp`→shrimp, `prawn`→shrimp, `crab`→crab, `squid`→squid, `seafood`→seafood,
`bacon`→bacon, `ham`→ham, `sausage`→sausage, `meatball`→meatball, `wonton`→wonton,
`tofu`→tofu, `egg`→egg, `omelet`→egg (covers "omelette"). Staples: `rice`→rice,
`noodle`→noodles, `vermicelli`→vermicelli, `bread`→bread, `sticky rice`→sticky rice.
Dairy/drink bases: `milk`→milk, `cream`→cream (covers "creamy"), `cheese`→cheese,
`yogurt`→milk, `yoghurt`→milk, `condensed milk`→milk, `evaporated milk`→milk, `cocoa`→cocoa,
`chocolate`→cocoa, `coffee`→coffee, `espresso`→coffee, `tea`→tea, `boba`→boba,
`bubble`→boba, `coconut`→coconut. Produce: `garlic`→garlic, `chili`→chili, `chilli`→chili,
`basil`→basil, `lime`→lime, `lemon`→lemon, `onion`→onion, `tomato`→tomato,
`cucumber`→cucumber, `papaya`→papaya, `mango`→mango, `banana`→banana, `pineapple`→pineapple,
`orange`→orange, `strawberry`→strawberry, `grape`→grape, `kiwi`→kiwi, `lychee`→lychee,
`melon`→melon, `watermelon`→watermelon, `passion fruit`→passion fruit, `apple`→apple,
`corn`→corn, `mushroom`→mushroom, `cabbage`→cabbage, `lettuce`→lettuce, `potato`→potato,
`sweet potato`→sweet potato, `taro`→taro, `pumpkin`→pumpkin, `eggplant`→eggplant,
`broccoli`→broccoli, `bean sprout`→bean sprouts, `quinoa`→quinoa, `avocado`→avocado,
`chickpea`→chickpeas. Condiments/other: `peanut`→peanut, `sesame`→sesame, `tahini`→sesame,
`mayo`→mayo, `soy sauce`→soy sauce, `fish sauce`→fish sauce, `oyster sauce`→oyster sauce,
`curry`→curry, `syrup`→syrup, `honey`→honey, `sugar`→sugar, `kimchi`→kimchi,
`ginger`→ginger, `lemongrass`→lemongrass, `galangal`→galangal, `tamarind`→tamarind,
`pandan`→pandan.

Order the `keyword` needles longest-first is unnecessary — every needle is matched
independently, and both `sweet potato`→sweet potato and `potato`→potato firing on the same
row is acceptable (distinct terms, both true).

### Statement 2 — `tags`

`tags` = sorted-distinct union of:

1. **Dietary** — `'halal'` if `is_halal`, `'vegetarian'` if `is_vegetarian`, `'jay'` if
   `is_jay`.
2. **Spice** — `'mild'` if `spice_level <= 2`, else `'spicy'`.
3. **Category slug** — map `category` exactly: `Main Dishes (Rice)` → `main-dishes-rice`,
   `Rice Dishes` → `main-dishes-rice`, `Beverages` → `beverages`, `Drinks` → `beverages`,
   `Noodles` → `noodles`, `Appetizers` → `appetizers`, `Main Dishes` → `main-dishes`,
   `Add-ons` → `add-ons`, `Desserts` → `desserts`, `Soup` → `soup`, `Salads` → `salad`,
   `Grilled` → `grilled`, `Curry` → `main-dishes`, `Bowls` → `main-dishes`. Any unlisted
   category → `lower(replace(replace(category,' ',''),'(',''))`-style fallback is **not**
   needed (the 14 values above are the complete live set); emit nothing for an unlisted
   category.
4. **Keyword tags from `doc`** (same `doc` string as Statement 1), via a second
   `tagword(needle, term)` table: `stir-fr`→stir-fried, `stir fr`→stir-fried,
   `deep-fr`→deep-fried, `deep fr`→deep-fried, `fried`→fried, `crispy`→crispy,
   `crisp`→crispy, `grill`→grilled, `roast`→roasted, `steam`→steamed, `boil`→boiled,
   `bake`→baked, `iced`→iced, ` ice`→iced, `hot `→hot, `sweet`→sweet, `spicy`→spicy,
   `smoothie`→smoothie, `blended`→smoothie, `salad`→salad, `soup`→soup, `broth`→soup,
   `curry`→curry, `noodle`→noodles, `thai`→thai, `chinese`→chinese, `korean`→korean,
   `japanese`→japanese, `italian`→italian, `isaan`→isaan, `esan`→isaan.

`fried` must not fire when only `stir-fried` / `deep-fried` is present is **not** a
requirement — `fried` appearing alongside `stir-fried` is fine (both are true and the
recommender benefits from the shared `fried` term).

If the union is empty (no dietary flag, `spice_level > 2` gives `spicy`, and category is
unlisted — impossible given the data), fall back to `ARRAY['mild']`.

### Statement 3 — re-derive `allergens`

Append the allergen-derivation logic from `20260903030000` verbatim: the `mappable(ingredient, tag)`
CTE `UPDATE ... WHERE allergens = '{}'` plus its `GET DIAGNOSTICS` guard and per-tag
coverage assertion. Rows whose freshly-written `ingredients` now contain `milk` / `cream` /
`cheese` / `peanut` / etc. get their allergen tags; already-tagged rows are untouched
(`WHERE allergens = '{}'`).

Wrap Statements 1–3 in a single `DO $$ ... $$` block so `GET DIAGNOSTICS` is available and
the whole thing is one transaction.

### Guard

After Statement 2, assert every target row has `cardinality(ingredients) >= 1` and
`cardinality(tags) >= 2`; `RAISE EXCEPTION` otherwise (would mean the keyword tables or the
`doc` expression regressed). Statement 3 keeps its own guards from `20260903030000`.

## Idempotency / ordering

- Scoped to `WHERE tags = '{}'`; after the migration those rows have non-empty `tags`, so a
  re-run is a no-op. (The migration is written to run once, like every seed migration.)
- Timestamp `20260903040000` sorts after `20260903030000` (allergen backfill) and after
  `20260903020001` (latest existing). On a fresh `db reset` the order is: seed → broken
  `20260902010000` (no-op) → allergen backfill (tags from sparse seed vocab) → **this
  migration** re-enriches `ingredients`/`tags` then re-derives `allergens`. End state is
  consistent.

## Impact (to be measured on local during implementation)

Expected: ~500 rows rewritten; `ingredients` distinct-term count rises from ~20 to ~60+;
every target row gains 2–6 `tags`; `allergens` non-empty count rises above the current 111
(rows that gain `milk`/`cream`/`cheese`/`peanut` ingredients).

## Testing / verification

Data-only migration; verified by SQL, not a jest test.

1. `npx supabase db reset` — full replay, no error, no `RAISE` from any guard.
2. `select count(*) filter (where tags='{}') from menu_items;` → expect **10** (only the
   demo rows; every KMUTT row now tagged).
3. `select count(distinct t) from (select unnest(ingredients) t from menu_items) x;` →
   expect ≥ 55.
4. Spot-checks: `Tropical Smoothie` (desc "Mango, pineapple, and banana blended fresh with
   coconut milk") → `ingredients` ⊇ {mango, pineapple, banana, coconut, milk};
   `tags` ⊇ {smoothie, beverages, mild}. `Wonton Noodle Soup` → `ingredients` ⊇ {pork,
   wonton, noodles, egg}; `tags` ⊇ {soup, noodles}. A `beef` dish still has `beef` in
   `allergens`.
5. Existing `menu_items` allergen expectations from `20260903030000` still hold or improve
   (never regress): `Pad Thai` demo row untouched (`tags <> '{}'`).
6. `npm test` (5 suites) unaffected — pure DB migration.

## Files

- **new:** `supabase/migrations/20260903040000_regenerate_menu_enrichment.sql`

## Follow-up (out of scope, noted)

`20260902010000_enrich_menu_item_ingredients_tags.sql` remains a dead no-op in history.
This migration supersedes its effect; a later cleanup could add a comment to the old file
pointing forward, but no code change is required.
