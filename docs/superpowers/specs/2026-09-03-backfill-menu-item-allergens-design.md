# Backfill `menu_items.allergens` from ingredients

**Date:** 2026-09-03
**Status:** Approved, ready for implementation plan

## Problem

502 of 510 rows in `menu_items` have `allergens = '{}'`. The warn-before-add allergy gate
(`src/app/item/[id].tsx` `confirmAddToCart` → `matchAllergens` in `src/hooks/usePreferences.ts`)
only fires when `menu_items.allergens` intersects `user_preferences.allergies`. With almost
no items tagged, the gate is effectively dead for the entire real KMUTT catalog — a student
with a dairy allergy can add an obviously-dairy drink (e.g. "Yogurt Smoothie", ingredients
`{milk/cocoa}`) with no warning.

Only the 10-item demo vendor **Everything Kitchen** carries any allergen tags (8 of its 10
items). Every one of the 500 real KMUTT vendor items is untagged.

Root cause: the KMUTT seed migrations (`20260830152020`, later vendor seeds, and the
`20260902010000` ingredient/tag enrichment) populated `ingredients` but never `allergens`.

## Goal

Backfill `menu_items.allergens` by deriving allergen tags from the already-populated
`menu_items.ingredients` array, using a high-precision per-ingredient lookup.

### Non-goals

- Inferring allergens from item `name`, `description`, or `tags`.
- Tagging `menu_item_addons.allergens` (separate table, no `ingredients` column, already
  seeded by `20260903020001_seed_addon_allergens.sql`).
- Changing `matchAllergens` / the gate logic — it is correct as written.
- Making the "Coconut Smoothie" in the reporter's screenshot warn. Its ingredients are
  `{coconut}`; coconut and coconut milk are plant-based and map to no allergen. The item
  correctly stays untagged.
- Retroactively fixing sparse `ingredients` lists (an item whose only ingredient is `pork`
  gets no tags — acceptable, a plain pork skewer carries no top-8 allergen).

## Approach

A single timestamped SQL data migration:
`supabase/migrations/20260903030000_backfill_menu_item_allergens.sql`

1. `UPDATE public.menu_items` … `WHERE allergens = '{}'` — only fill rows that have no tags,
   so the hand-tagged Everything Kitchen rows are never touched.
2. For each such row, walk `ingredients`, map each term through the lookup table below,
   collect the distinct set, and write it to `allergens`.
3. A trailing `DO $$ … $$` guard that `RAISE EXCEPTION` if the number of rows updated is 0
   (catches a future `ingredients` vocabulary drift that would silently make the migration
   a no-op).

Idempotent: a second run finds no `allergens = '{}'` rows among the backfilled set and is a
no-op. (Rows that legitimately stay empty because no ingredient mapped would be
re-processed on re-run and re-produce the empty result — still a no-op in effect.)

### Ingredient → allergen lookup

Every left-hand term is a real value from the 66 distinct entries in
`menu_items.ingredients` (verified against the live local DB, 2026-09-03).

| ingredient term(s)                                   | allergen tag |
|-----------------------------------------------------|--------------|
| `milk/cocoa`, `condensed milk`, `evaporated milk`   | `dairy`      |
| `egg`, `egg noodles`                                | `eggs`       |
| `shrimp`, `dried shrimp`, `seafood`                 | `shellfish`  |
| `peanuts`                                           | `peanuts`    |
| `tahini`                                            | `sesame`     |
| `tofu`, `vegetable/tofu`, `soy sauce`               | `soy`        |
| `beef`                                              | `beef`       |

Output tag strings match the vocabulary already stored by the student picker
(`ALLERGY_VALUES` in `src/lib/allergy-options.ts`) and the vendor picker
(`ALLERGEN_VOCAB`), so `matchAllergens` (exact string membership, case-sensitive) matches
without any normalisation layer.

### Deliberate exclusions

- `coconut`, `coconut milk` → no tag (plant-based; not dairy).
- `fish`, `fish sauce` → no tag. Plain fish is not in the `shellfish` vocabulary and fish
  sauce is in nearly every Thai savoury dish — tagging it would make the warning fire
  constantly and train students to dismiss it.
- bare `noodles`, `rice noodles`, `rice/noodle` → no `gluten` (rice noodles are
  gluten-free; the seed does not distinguish wheat noodles except `egg noodles`, already
  mapped to `eggs`).
- `choice of meat` → no `beef` (ambiguous).

## Companion code change: `beef` as a real allergen tag

`beef` is already a value in `ALLERGY_VALUES` and `ALLERGY_LABELS` (the student picker maps
"Beef" → `'beef'`), but no menu item has ever been tagged `beef` and it is absent from
`ALLERGEN_VOCAB` — the list the vendor menu editor (`src/app/(vendor)/menu/new.tsx`,
`src/app/(vendor)/menu/[id]/addons.tsx`) offers. This migration makes `beef` a live tag on
~12 items, so:

- Add `{ key: 'beef', labelKey: 'onboarding.allergy.beef' }` to `ALLERGEN_VOCAB` in
  `src/lib/allergy-options.ts` so vendors can pick it going forward.
- Update the two stale comments in that file that enumerate
  "distinct allergens = dairy, soy, eggs, sesame, peanuts, shellfish, gluten" and
  "Restricted to tags that actually appear in seeded menu_items.allergens" to include
  `beef` and reference this migration.

`onboarding.allergy.beef` already exists in both `src/lib/i18n/en.ts` and
`src/lib/i18n/th.ts` (used by `ALLERGY_LABELS`), so no new i18n strings.

## Measured impact (live local DB, 2026-09-03)

- Rows with `allergens = '{}'` before: 502.
- Rows tagged by the backfill: **103**.
- Tag breakdown across those rows: `shellfish` 39, `dairy` 23, `eggs` 21, `beef` 12,
  `soy` 8. (`peanuts` / `sesame` yield 0 new rows — the only items with those ingredients
  are already hand-tagged.)
- Rows still `'{}'` after: 399 (dishes whose ingredients carry no top-8 allergen — expected
  and correct).

## Testing / verification

The migration is data-only; verification is by SQL assertion, not a new test file.

1. **Built-in guard:** the `DO` block in the migration fails the run if 0 rows were updated.
2. **Post-migration checks** (run manually / recorded in the plan):
   - `SELECT count(*) FROM menu_items WHERE allergens <> '{}';` → expect 8 + 103 = 111.
   - Hand-tagged rows unchanged: the 8 Everything Kitchen tagged rows still hold their
     original arrays (spot-check `Pad Thai` → `{peanuts,eggs,shellfish}`).
   - Spot-checks: `Chocolate Bear Brand Milk Smoothie` → `{dairy}`;
     an `egg`-ingredient rice dish (e.g. `Pad See Ew` / `Khao Pad`) → contains `eggs`;
     a `beef` dish → contains `beef`; `Coconut Smoothie` → still `{}`.
3. **Regression:** existing `src/lib/__tests__/cart-store.test.ts` must still pass
   (`npm test` / the project's jest run). `matchAllergens` has no dedicated test and is
   unchanged; no new unit test is required for this data migration.
4. **Lint:** `npm run lint` clean after the `allergy-options.ts` edit.

## Files

- **new:** `supabase/migrations/20260903030000_backfill_menu_item_allergens.sql`
- **edit:** `src/lib/allergy-options.ts` (add `beef` to `ALLERGEN_VOCAB`, refresh the two
  allergen-vocabulary comments)

## Rollout

`npx supabase db push` applies the migration to the hosted project
(`rxrxsgsxbuevclfqwhtu`), which is what the app currently points at. No app rebuild needed
for the data change; the `allergy-options.ts` edit ships with the next JS bundle / EAS
build.
