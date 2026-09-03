# Backfill menu_items.allergens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the empty `menu_items.allergens` arrays by deriving allergen tags from `menu_items.ingredients`, so the warn-before-add allergy gate actually fires for the real KMUTT catalog.

**Architecture:** One timestamped SQL data migration does a single `UPDATE` with a correlated subquery that maps each ingredient string to an allergen tag via a fixed lookup, touching only rows where `allergens = '{}'`. A trailing `DO` block aborts the migration if fewer than 100 rows end up tagged (drift guard). A small follow-up edit to `src/lib/allergy-options.ts` adds `beef` to the vendor-side allergen picker vocabulary, since the migration makes `beef` a live tag.

**Tech Stack:** Supabase (Postgres) migrations via the Supabase CLI; local DB reachable through the `supabase_db_Eatzy` Docker container; TypeScript / React Native for the `allergy-options.ts` edit; Jest for the regression check.

## Global Constraints

- Migration filename: `supabase/migrations/20260903030000_backfill_menu_item_allergens.sql` (timestamp must sort after the latest existing migration `20260903020001_seed_addon_allergens.sql`).
- Only rows with `allergens = '{}'` may be modified. The 8 hand-tagged "Everything Kitchen" rows must be left byte-for-byte unchanged.
- Allergen tag output strings, exact: `dairy`, `eggs`, `shellfish`, `peanuts`, `sesame`, `soy`, `beef`. These match `ALLERGY_VALUES` / `ALLERGEN_VOCAB` in `src/lib/allergy-options.ts`; `matchAllergens` does a case-sensitive exact membership test with no normalisation.
- Ingredient→allergen lookup (every left term is a real value in `menu_items.ingredients` as of 2026-09-03):
  - `milk/cocoa`, `condensed milk`, `evaporated milk` → `dairy`
  - `egg`, `egg noodles` → `eggs`
  - `shrimp`, `dried shrimp`, `seafood` → `shellfish`
  - `peanuts` → `peanuts`
  - `tahini` → `sesame`
  - `tofu`, `vegetable/tofu`, `soy sauce` → `soy`
  - `beef` → `beef`
- Deliberately NOT mapped: `coconut`, `coconut milk` (plant, not dairy); `fish`, `fish sauce` (not in vocab, ubiquitous); bare `noodles`, `rice noodles`, `rice/noodle` (rice noodles are gluten-free); `choice of meat` (ambiguous).
- Do not alter `matchAllergens` or `src/app/item/[id].tsx` — the gate logic is correct.
- `menu_item_addons.allergens` is out of scope.
- Expected result on the current DB: `UPDATE 103`; 111 rows total with non-empty `allergens` (8 pre-existing + 103); 399 rows still `'{}'`.

---

### Task 1: Allergen backfill migration

**Files:**
- Create: `supabase/migrations/20260903030000_backfill_menu_item_allergens.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks. Reads `public.menu_items` columns `id`, `ingredients` (`text[]`), `allergens` (`text[]`).
- Produces: `public.menu_items.allergens` populated for ~103 previously-empty rows. Task 2 depends on the fact that `beef` is now a real value appearing in `menu_items.allergens`.

- [ ] **Step 1: Capture the current broken state (the "failing test")**

Run:
```bash
docker exec -i supabase_db_Eatzy psql -U postgres -c "
select
  count(*) filter (where allergens = '{}') as empty_allergens,
  count(*) filter (where allergens <> '{}') as tagged
from menu_items;
select name, allergens from menu_items
where name in ('Chocolate Bear Brand Milk Smoothie','Thai Milk Tea','Pad Thai')
order by name;"
```
Expected now (pre-migration): `empty_allergens = 502`, `tagged = 8`; `Chocolate Bear Brand Milk Smoothie` and `Thai Milk Tea` both show `{}`; `Pad Thai` shows `{peanuts,eggs,shellfish}`. This is the state the migration must change (smoothie/tea) and preserve (Pad Thai).

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260903030000_backfill_menu_item_allergens.sql` with exactly this content:

```sql
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
```

- [ ] **Step 3: Apply the migration to the local DB**

Run:
```bash
npx supabase db push --local
```
Expected: the CLI reports `20260903020001_seed_addon_allergens.sql` already applied and applies `20260903030000_backfill_menu_item_allergens.sql` with no error. (If `db push --local` is unavailable in this CLI version, use `npx supabase migration up --local`.)
Expected: no `raise exception` from the `DO` block.

- [ ] **Step 4: Verify the data change**

Run:
```bash
docker exec -i supabase_db_Eatzy psql -U postgres -c "
select
  count(*) filter (where allergens = '{}') as empty_allergens,
  count(*) filter (where allergens <> '{}') as tagged
from menu_items;
select unnest(allergens) as a, count(*) from menu_items group by 1 order by 2 desc;
select name, allergens from menu_items
where name in ('Chocolate Bear Brand Milk Smoothie','Thai Milk Tea','Coconut Smoothie','Pad Thai')
order by name;"
```
Expected:
- `empty_allergens = 399`, `tagged = 111`.
- Tag counts: `shellfish 43`, `dairy 24`, `eggs 23`, `beef 12`, `soy 9`, `peanuts 2`, `sesame 1`, `gluten 1`.
- `Chocolate Bear Brand Milk Smoothie` → `{dairy}`; `Thai Milk Tea` → `{dairy}`; `Coconut Smoothie` → `{}` (unchanged, correct — coconut is not a mapped allergen); `Pad Thai` → `{peanuts,eggs,shellfish}` (hand-tagged row preserved).

- [ ] **Step 5: Verify idempotency**

Re-run just the `UPDATE` statement from the migration and confirm it reports `UPDATE 0`:
```bash
docker exec -i supabase_db_Eatzy psql -U postgres <<'SQL'
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
    select 1 from unnest(m.ingredients) as ing
    where ing in (
      'milk/cocoa', 'condensed milk', 'evaporated milk', 'egg', 'egg noodles',
      'shrimp', 'dried shrimp', 'seafood', 'peanuts', 'tahini',
      'tofu', 'vegetable/tofu', 'soy sauce', 'beef'
    )
  );
SQL
```
Expected: `UPDATE 0` (every mappable row is already tagged; rows still `'{}'` have no mappable ingredient so the `exists` clause excludes them).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260903030000_backfill_menu_item_allergens.sql
git commit -m "$(cat <<'EOF'
feat(allergy): backfill menu_items.allergens from ingredients

502/510 menu items had empty allergens[], so the warn-before-add gate never
fired for the real KMUTT catalog. Derive tags from menu_items.ingredients via a
fixed per-ingredient lookup (dairy/eggs/shellfish/peanuts/sesame/soy/beef),
touching only rows with allergens = '{}' so hand-tagged rows are preserved.
103 rows newly tagged. A DO-block guard aborts the migration if the lookup ever
stops matching. coconut/coconut milk, fish/fish sauce and bare noodles are
deliberately excluded.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add `beef` to the vendor allergen picker vocabulary

**Files:**
- Modify: `src/lib/allergy-options.ts`

**Interfaces:**
- Consumes: from Task 1, the fact that `beef` now appears as a real value in `menu_items.allergens`.
- Produces: `ALLERGEN_VOCAB` in `src/lib/allergy-options.ts` gains a `{ key: 'beef', labelKey: 'onboarding.allergy.beef' }` entry. No new exports, no signature changes. `ALLERGY_VALUES` / `ALLERGY_LABELS` already contain `beef` and are unchanged.

- [ ] **Step 1: Confirm the i18n key already exists**

Run:
```bash
grep -n "onboarding.allergy.beef" src/lib/i18n/en.ts src/lib/i18n/th.ts
```
Expected: one match in each file. (If missing in either, that is a separate bug — stop and report; do not add strings in this task.)

- [ ] **Step 2: Add the `beef` entry to `ALLERGEN_VOCAB`**

In `src/lib/allergy-options.ts`, the `ALLERGEN_VOCAB` array currently ends:

```ts
  { key: 'shellfish', labelKey: 'onboarding.allergy.seafood' },
  { key: 'eggs', labelKey: 'onboarding.allergy.egg' },
];
```

Change it to:

```ts
  { key: 'shellfish', labelKey: 'onboarding.allergy.seafood' },
  { key: 'eggs', labelKey: 'onboarding.allergy.egg' },
  { key: 'beef', labelKey: 'onboarding.allergy.beef' },
];
```

- [ ] **Step 3: Refresh the two stale allergen-vocabulary comments**

In `src/lib/allergy-options.ts`, the comment above `ALLERGY_VALUES` currently ends:

```ts
// live data: distinct menu_items.allergens = dairy, soy, eggs, sesame,
// peanuts, shellfish, gluten.
```

Change the last line to:

```ts
// peanuts, shellfish, gluten, plus beef added by migration
// 20260903030000_backfill_menu_item_allergens.
```

And the comment above `ALLERGEN_VOCAB` currently contains:

```ts
// Restricted to tags that actually appear in seeded menu_items.allergens.
```

Change that line to:

```ts
// Restricted to tags that actually appear in menu_items.allergens (see
// migration 20260903030000_backfill_menu_item_allergens, which added beef).
```

- [ ] **Step 4: Typecheck and lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```
Expected: no errors. (`ALLERGEN_VOCAB` is typed `{ key: string; labelKey: TranslationKey }[]`; `'onboarding.allergy.beef'` is an existing `TranslationKey`, so the new entry typechecks.)

- [ ] **Step 5: Run the test suite (regression)**

Run:
```bash
npm test
```
Expected: all existing suites pass, including `src/lib/__tests__/cart-store.test.ts`. Nothing in this task changes runtime behaviour of the cart or the gate.

- [ ] **Step 6: Commit**

```bash
git add src/lib/allergy-options.ts
git commit -m "$(cat <<'EOF'
feat(allergy): expose beef in the vendor allergen picker

Migration 20260903030000 makes 'beef' a live tag on ~12 menu items, so vendors
need it in ALLERGEN_VOCAB to pick it going forward. 'beef' was already in
ALLERGY_VALUES / ALLERGY_LABELS (student picker). Refreshes the two stale
"distinct allergens = ..." comments in the same file.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**
- Problem / empty-allergens backfill → Task 1. ✓
- Ingredient→allergen lookup table (spec §3) → Task 1 Step 2, verbatim. ✓
- Deliberate exclusions (spec §5) → Global Constraints + migration comment. ✓
- Fill-empty-only, preserve hand-tagged (spec §Approach) → `WHERE m.allergens = '{}'`; verified in Task 1 Step 4 (Pad Thai check). ✓
- `DO`-block drift guard (spec §Approach, §Testing item 1) → Task 1 Step 2. ✓
- Idempotency (spec §Approach) → Task 1 Step 5. ✓
- Measured impact 103 rows / 111 tagged / 399 empty (spec §Impact) → Task 1 Step 4 expected values. ✓
- `beef` added to `ALLERGEN_VOCAB` + comment refresh (spec §Companion code change) → Task 2. ✓
- No new i18n strings (spec §Companion) → Task 2 Step 1 confirms existing key. ✓
- Regression: `cart-store.test.ts` passes, lint clean (spec §Testing items 3–4) → Task 2 Steps 4–5. ✓
- `matchAllergens` / `item/[id].tsx` untouched (spec §Non-goals) → Global Constraints; no task edits them. ✓
- `menu_item_addons` out of scope (spec §Non-goals) → Global Constraints; no task touches it. ✓
- Rollout via `supabase db push` to hosted (spec §Rollout) → out of plan scope by design (plan targets local; hosted push is a manual release step the operator runs after merge). Noted here so it is not lost.

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". All SQL and TS shown in full. ✓

**3. Type consistency:** Tag strings `dairy|eggs|shellfish|peanuts|sesame|soy|beef` identical in Global Constraints, Task 1 SQL, and Task 1 Step 4 expectations. `ALLERGEN_VOCAB` entry shape `{ key, labelKey }` matches the existing array literal in `allergy-options.ts`. `onboarding.allergy.beef` used consistently. ✓
