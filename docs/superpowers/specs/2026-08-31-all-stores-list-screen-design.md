# All-Stores List Screen + "See all" link

**Date:** 2026-08-31
**Status:** Approved, ready for implementation plan

## Problem

Home tab (`src/app/(tabs)/index.tsx`) "Store Options" section renders `vendors.slice(0, 6)` —
a hard cap on a query that already returns every open vendor (`.eq('is_open', true)`,
ordered by `current_queue_count` asc). Students cannot reach the other stalls (16 stalls
seeded) or see which stalls are currently closed. There is no full vendor directory
anywhere in the student app — `search.tsx` searches menu items only.

## Goal

- Add a dedicated stores list screen showing the full vendor directory (open + closed).
- Link to it from the home "Store Options" section header via a "See all" affordance.

Non-goals: filtering by cuisine, map view, favouriting stores, fixing the
`cuisine_tags` seed data (see Known Issue below).

## Screen: `src/app/stores.tsx`

New public entry route. Expo Router auto-registers it at `/stores` — root `_layout.tsx`
uses a bare `<Stack>` with no per-screen `Stack.Screen` entries, so no layout change is
needed. It sits alongside `search.tsx`, `cart.tsx`, `notifications.tsx` as a standalone
screen outside the tab groups.

### Data

Single query on mount **and** on focus:

```ts
supabase
  .from('vendors')
  .select('id,name,is_open,is_halal_certified,current_queue_count,estimated_wait_min,cuisine_tags,cover_image_url')
  .order('is_open', { ascending: false })
  .order('current_queue_count', { ascending: true });
```

- No `is_open` filter — closed stalls are included, sorted below open ones.
- Within each `is_open` group, shortest queue first (mirrors home's ranking).
- Refetch on focus with `useFocusEffect` (per CLAUDE.md: student lists that poll live
  server state refetch on tab focus, not just mount — `is_open` and queue counts drift
  while the screen is backgrounded). Guard against setState-after-unmount the same way
  other screens do (or accept the existing pattern in `search.tsx` if it has none —
  match the codebase, do not invent a new guard).
- On query error: `setVendors([])` and stop loading (same posture as home's `catch`).

### Type

Local `type Vendor` in the file with exactly the selected columns. No `any`, no
`as unknown as` unless a Supabase generated-type mismatch forces it (as in
`search.tsx` line 82 — if so, mirror that exact cast style).

### Layout

Mirror `search.tsx` structure:

- `SafeAreaView` with `edges={['top']}`, `backgroundColor: Brand.bg`.
- Header block (`paddingHorizontal: 20`): back arrow (`Ionicons name="arrow-back"`,
  `router.back()`) + a search `TextInput` in the rounded pill (placeholder
  `t('stores.searchPlaceholder')`, `autoFocus` **off** — this is a browse screen, not
  a search-first screen), with the clear-`X` when non-empty.
- Below the field: a single filter chip row with one chip, "Halal certified"
  (`t('stores.halalFilter')`), toggling like the diet chips in `search.tsx`
  (selected = `Brand.orange` bg, white text).
- `loading` → centered `ActivityIndicator` (`Brand.orange`, `size="large"`).
- Loaded → `ScrollView` (`keyboardShouldPersistTaps="handled"`, `paddingBottom: 40`)
  with a count line (`t('stores.resultsCount', { n })` — reuse `search.resultsCount`
  string if wording matches; otherwise add `stores.resultsCount`) then the list.

### Row card

Reuse the visual from home's Store Options row (`index.tsx` lines 557–595):

- `flexDirection: 'row'`, `gap: 16`, `backgroundColor: Brand.card`, `borderRadius: 24`,
  `padding: 12`, same shadow.
- 62×62 `borderRadius: 12` tile, `Brand.orangeLight` bg: `cover_image_url` image or
  `🏪` fallback at `fontSize: 28`.
- Right of tile: `vendor.name` (14/600), then subtitle
  `vendor.cuisine_tags?.[0] ?? t('home.thaiFood')` (12, `#5a4136`) — carried over
  verbatim from home (see Known Issue).
- Status line under the subtitle:
  - `is_open === false` → grey pill badge, text `t('stores.closed')`, bg `Brand.border`
    or `#e7ded9`, text `#5a4136`.
  - `is_open === true && current_queue_count === 0` → `t('stores.noQueue')`.
  - `is_open === true && current_queue_count > 0` →
    `t('stores.waitMin', { n: vendor.estimated_wait_min })`. If `estimated_wait_min`
    is null/0, fall back to `t('stores.noQueue')`.
- `is_halal_certified` → the existing small halal badge (`#ffeae1` bg,
  `t('common.halal')`), kept.
- Whole row is a `Tap` → `router.push(\`/store/${vendor.id}\`)`, `activeOpacity={0.85}`.
- Closed rows: wrapper `opacity: 0.5`, still tappable.

### Filtering

Client-side `useMemo` over the fetched array, same shape as `search.tsx` `results`:

```
vendors
  .filter(v => !halalOnly || v.is_halal_certified)
  .filter(v => !needle || v.name.toLowerCase().includes(needle))
```

Order is preserved from the query (open-first, queue asc) — do not re-sort client-side.
`needle = query.trim().toLowerCase()`.

### Empty state

Filtered result empty → centered block, `🏪` at `fontSize: 32`, `t('stores.noneFound')`
(`Brand.textSecondary`, centered), `paddingVertical: 60`. This is distinct from "no
vendors exist at all" but one message covers both — the directory realistically always
has rows, and the filtered-empty copy ("No stores match") reads fine when the DB is
genuinely empty too. One key, `stores.noneFound`.

## Home change: `src/app/(tabs)/index.tsx`

In the "Store Options" `<View>` (line ~552), change the heading `<Text>` into a
`flexDirection: 'row'` container: heading on the left (unchanged style), a `Tap` on the
right — `t('home.seeAll')` in `Brand.orange`, 14/600, with a trailing
`Ionicons name="chevron-forward"` — calling `router.push('/stores')`.

- Render the header row (with "See all") whenever `vendors.length > 0`.
- When `vendors.length === 0` the existing `t('home.noStallsOpen')` empty state still
  shows; "See all" is hidden in that case (nothing to browse — home only fetched open
  vendors, but the empty home is not the place to surface closed ones).
- `vendors.slice(0, 6)` is unchanged.
- `Ionicons` is already imported in `index.tsx` (used elsewhere) — confirm before adding
  the import.

## i18n

Add to both `src/lib/i18n/en.ts` and `src/lib/i18n/th.ts` (keep key ordering/grouping
consistent with neighbours in each file):

| Key | English | Thai |
| --- | --- | --- |
| `home.seeAll` | `See all` | `ดูทั้งหมด` |
| `stores.title` | `Stores` | `ร้านค้า` |
| `stores.searchPlaceholder` | `Search stores` | `ค้นหาร้านค้า` |
| `stores.halalFilter` | `Halal certified` | `ฮาลาลรับรอง` |
| `stores.closed` | `Closed` | `ปิด` |
| `stores.noQueue` | `No queue` | `ไม่มีคิว` |
| `stores.waitMin` | `~{n} min wait` | `รอ ~{n} นาที` |
| `stores.noneFound` | `No stores match` | `ไม่พบร้านค้าที่ตรงกับการค้นหา` |

Only add `stores.resultsCount` if `search.resultsCount`'s wording does not fit; prefer
reusing the existing key. `stores.title` reuses the same Thai string as the existing
`home.storeOptions` — that is fine, they are separate keys.

Thai strings above are a starting point; the implementer should keep them if reasonable
or adjust for naturalness. `{n}` interpolation must match the project's existing
`t(key, params)` convention (see `search.resultsCount` usage at `search.tsx:167`).

## Testing

Manual (no test harness for RN screens in this repo):

1. Home → "Store Options" shows "See all" with chevron → tap → `/stores` opens.
2. `/stores` lists more than 6 stores; open stores appear before closed ones.
3. Closed store row shows greyed with "Closed" badge, still opens its `/store/[id]`.
4. Open store with `current_queue_count = 0` shows "No queue"; one with a queue shows
   "~N min wait".
5. Type a store name fragment → list narrows; clear → full list back.
6. Toggle "Halal certified" → only halal-certified stores; toggle off → all back.
7. No match → `🏪` + "No stores match".
8. Background the screen, flip a vendor's `is_open` in Supabase, refocus → row updates.
9. Switch language to Thai → title, placeholder, chip, badges, wait text all translate.
10. `npm run lint` clean; `tsc` (via editor) no errors — no `any`.

## Known Issue (not fixed here)

Every store row's subtitle currently reads "อาหารไทย" / falls back to `home.thaiFood`
because `vendors.cuisine_tags` is empty/unseeded for most stalls. This screen mirrors
that fallback rather than fixing it. Real fix = seed `cuisine_tags` in the vendor data.
Track separately.

## Files touched

- `src/app/stores.tsx` — new
- `src/app/(tabs)/index.tsx` — "See all" header row
- `src/lib/i18n/en.ts` — 8 keys
- `src/lib/i18n/th.ts` — 8 keys
