# All-Stores List Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full vendor-directory screen at `/stores` (open + closed stalls) and link to it from the home "Store Options" section.

**Architecture:** New standalone Expo Router screen `src/app/stores.tsx`, structured like the existing `src/app/search.tsx` (SafeAreaView + header + search field + one filter chip + scrollable card list). It fetches every row from `vendors` (no `is_open` filter), sorts open-first then by shortest queue, refetches on focus via the repo's `useFocusGuard` + `useFocusEffect` pattern, and filters client-side by name substring and a halal toggle. Home's "Store Options" heading gains a right-aligned "See all ›" tap that routes to `/stores`.

**Tech Stack:** React Native, Expo Router (file-based routing, SDK 54), Supabase JS client, NativeWind not used in these screens (inline style objects, matching `search.tsx`), `@/lib/i18n` for strings.

## Global Constraints

- `tsconfig.json` `strict: true` — no `any`. Mirror `search.tsx:82` `as unknown as (...)` cast style only if the Supabase generated type forces it.
- All user-visible text goes through `t('key')` from `useI18n()`; every new key must exist in BOTH `src/lib/i18n/en.ts` and `src/lib/i18n/th.ts` (the `TranslationKey` type is derived from `en.ts`; `th.ts` must satisfy `Record<TranslationKey, string>` or it fails typecheck).
- `{n}` interpolation uses the existing `t(key, { n })` convention (`translate()` in `src/lib/i18n/index.ts` replaces `/\{(\w+)\}/g`).
- Student lists that show live server state refetch on focus, not just mount (CLAUDE.md Localization section) — use `useFocusGuard()` from `@/hooks/useFocusGuard` + `useFocusEffect` from `expo-router`, exactly as `src/app/(tabs)/wallet.tsx:43,56-67` does.
- Icons in `src/app/(tabs)/index.tsx` are inline `react-native-svg`, NOT `@expo/vector-icons` — do not add an `Ionicons` import there. `search.tsx` DOES use `Ionicons` and that is fine to keep using inside `stores.tsx`.
- No DB migrations, no new npm dependencies.
- Route auto-registers: root `src/app/_layout.tsx` is a bare `<Stack screenOptions={{ headerShown: false }} />` with no per-screen entries. Creating `src/app/stores.tsx` is sufficient; do not edit `_layout.tsx`.
- No RN test harness in this repo. "Tests" here = `npm run lint` clean + no TS errors + the manual checks listed per task.

---

## File Structure

- **Create `src/app/stores.tsx`** — the stores directory screen. Owns: fetch-all-vendors query, focus refetch, name-search + halal-filter state, list + row rendering, empty/loading states.
- **Modify `src/app/(tabs)/index.tsx`** — "Store Options" section header only (~lines 551-555): heading becomes a row with a "See all ›" tap to `/stores`. `vendors.slice(0, 6)` unchanged.
- **Modify `src/lib/i18n/en.ts`** — add 9 keys (`home.seeAll` near line 89 in the `home.*` block; `stores.*` as a new block after the `search.*` block ~line 155).
- **Modify `src/lib/i18n/th.ts`** — same 9 keys, same positions, Thai values.

---

## Task 1: Add i18n keys

**Files:**
- Modify: `src/lib/i18n/en.ts` (`home.*` block ~line 89; new `// Stores` block after `search.noResults` ~line 155)
- Modify: `src/lib/i18n/th.ts` (same two spots; `home.storeOptions` is ~line 91, `search.noResults` is ~line 157)

**Interfaces:**
- Consumes: nothing.
- Produces: these `TranslationKey`s, usable as `t('...')` in Task 2 and Task 3:
  - `home.seeAll` → `"See all"` / `"ดูทั้งหมด"`
  - `stores.title` → `"Stores"` / `"ร้านค้า"`
  - `stores.searchPlaceholder` → `"Search stores"` / `"ค้นหาร้านค้า"`
  - `stores.halalFilter` → `"Halal certified"` / `"ฮาลาลรับรอง"`
  - `stores.resultsCount` → `"{n} stores"` / `"{n} ร้านค้า"`
  - `stores.closed` → `"Closed"` / `"ปิด"`
  - `stores.noQueue` → `"No queue"` / `"ไม่มีคิว"`
  - `stores.waitMin` → `"~{n} min wait"` / `"รอ ~{n} นาที"`
  - `stores.noneFound` → `"No stores match"` / `"ไม่พบร้านค้าที่ตรงกับการค้นหา"`

- [ ] **Step 1: Add `home.seeAll` to `en.ts`**

In `src/lib/i18n/en.ts`, in the `home.*` group (right after `'home.storeOptions': 'Store Options',`):

```ts
  'home.seeAll': 'See all',
```

- [ ] **Step 2: Add the `stores.*` block to `en.ts`**

In `src/lib/i18n/en.ts`, immediately after the line `'search.noResults': 'No dishes match your search.\nTry a different name or filter.',`:

```ts

  // Stores
  'stores.title': 'Stores',
  'stores.searchPlaceholder': 'Search stores',
  'stores.halalFilter': 'Halal certified',
  'stores.resultsCount': '{n} stores',
  'stores.closed': 'Closed',
  'stores.noQueue': 'No queue',
  'stores.waitMin': '~{n} min wait',
  'stores.noneFound': 'No stores match',
```

- [ ] **Step 3: Add `home.seeAll` to `th.ts`**

In `src/lib/i18n/th.ts`, right after `'home.storeOptions': 'ร้านค้า',`:

```ts
  'home.seeAll': 'ดูทั้งหมด',
```

- [ ] **Step 4: Add the `stores.*` block to `th.ts`**

In `src/lib/i18n/th.ts`, immediately after the line `'search.noResults': 'ไม่พบเมนูที่ค้นหา\nลองชื่ออื่นหรือเปลี่ยนตัวกรอง',`:

```ts

  // Stores
  'stores.title': 'ร้านค้า',
  'stores.searchPlaceholder': 'ค้นหาร้านค้า',
  'stores.halalFilter': 'ฮาลาลรับรอง',
  'stores.resultsCount': '{n} ร้านค้า',
  'stores.closed': 'ปิด',
  'stores.noQueue': 'ไม่มีคิว',
  'stores.waitMin': 'รอ ~{n} นาที',
  'stores.noneFound': 'ไม่พบร้านค้าที่ตรงกับการค้นหา',
```

- [ ] **Step 5: Verify typecheck + lint**

Run: `npm run lint`
Expected: no errors. If `th.ts` is missing a key that `en.ts` has (or vice versa), TS reports `Property 'stores.x' is missing in type` — add the missing key.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/en.ts src/lib/i18n/th.ts
git commit -m "i18n(stores): add keys for stores list screen and See all link"
```

---

## Task 2: Create the `/stores` screen

**Files:**
- Create: `src/app/stores.tsx`
- Reference (read, do not modify): `src/app/search.tsx` (layout + cast pattern), `src/app/(tabs)/index.tsx:557-595` (row card visual), `src/app/(tabs)/wallet.tsx:43,56-67` (focus refetch pattern), `src/hooks/useFocusGuard.ts`

**Interfaces:**
- Consumes: `t('stores.title' | 'stores.searchPlaceholder' | 'stores.halalFilter' | 'stores.resultsCount' | 'stores.closed' | 'stores.noQueue' | 'stores.waitMin' | 'stores.noneFound')` and `t('home.thaiFood')`, `t('common.halal')` from Task 1 / existing keys.
- Produces: a default-exported `StoresScreen` React component at route `/stores`. Consumed by Task 3 via `router.push('/stores')`.

- [ ] **Step 1: Write the full screen file**

Create `src/app/stores.tsx` with exactly this content:

```tsx
import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Image, TextInput, ActivityIndicator } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { useFocusGuard } from '@/hooks/useFocusGuard';

type Vendor = {
  id: string;
  name: string;
  is_open: boolean | null;
  is_halal_certified: boolean | null;
  current_queue_count: number | null;
  estimated_wait_min: number | null;
  cuisine_tags: string[] | null;
  cover_image_url: string | null;
};

const VENDOR_FIELDS =
  'id,name,is_open,is_halal_certified,current_queue_count,estimated_wait_min,cuisine_tags,cover_image_url';

export default function StoresScreen() {
  const { t } = useI18n();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [halalOnly, setHalalOnly] = useState(false);
  const cancelledRef = useFocusGuard();

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('vendors')
        .select(VENDOR_FIELDS)
        .order('is_open', { ascending: false })
        .order('current_queue_count', { ascending: true })
        .then(({ data, error }) => {
          if (cancelledRef.current) return;
          setVendors(error || !data ? [] : (data as Vendor[]));
          setLoading(false);
        });
    }, [cancelledRef])
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return vendors
      .filter(v => !halalOnly || v.is_halal_certified === true)
      .filter(v => !needle || v.name.toLowerCase().includes(needle));
  }, [vendors, query, halalOnly]);

  function statusLine(v: Vendor): string {
    if (v.is_open !== true) return t('stores.closed');
    if ((v.current_queue_count ?? 0) === 0 || !v.estimated_wait_min) return t('stores.noQueue');
    return t('stores.waitMin', { n: v.estimated_wait_min });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav + search field */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Tap onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={Brand.textPrimary} />
          </Tap>
          <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>
            {t('stores.title')}
          </Text>
        </View>

        <View style={{
          flexDirection: 'row', alignItems: 'center', marginTop: 12,
          backgroundColor: 'rgba(248,221,210,0.5)', borderRadius: 16, paddingHorizontal: 14,
        }}>
          <Ionicons name="search" size={16} color={Brand.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('stores.searchPlaceholder')}
            placeholderTextColor="#5a4136"
            style={{ flex: 1, fontSize: 16, color: '#261812', paddingVertical: 14, paddingHorizontal: 10 }}
          />
          {query.length > 0 && (
            <Tap onPress={() => setQuery('')} haptic={false}>
              <Ionicons name="close-circle" size={18} color={Brand.textSecondary} />
            </Tap>
          )}
        </View>

        {/* Halal filter chip */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Tap
            onPress={() => setHalalOnly(v => !v)}
            haptic={false}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 50,
              backgroundColor: halalOnly ? Brand.orange : Brand.card,
              borderWidth: 1.5, borderColor: halalOnly ? Brand.orange : Brand.border,
            }}
          >
            <Text style={{ color: halalOnly ? '#fff' : Brand.textPrimary, fontWeight: '600', fontSize: 13 }}>
              {t('stores.halalFilter')}
            </Text>
          </Tap>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Brand.orange} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ color: Brand.textSecondary, fontSize: 13, marginBottom: 12 }}>
            {t('stores.resultsCount', { n: results.length })}
          </Text>

          <View style={{ gap: 12 }}>
            {results.map(vendor => (
              <Tap
                key={vendor.id}
                onPress={() => router.push(`/store/${vendor.id}`)}
                activeOpacity={0.85}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 16,
                  backgroundColor: Brand.card, borderRadius: 24, padding: 12,
                  opacity: vendor.is_open === true ? 1 : 0.5,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.04, shadowRadius: 30, elevation: 2,
                }}
              >
                <View style={{
                  width: 62, height: 62, borderRadius: 12,
                  backgroundColor: Brand.orangeLight, overflow: 'hidden',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {vendor.cover_image_url
                    ? <Image source={{ uri: vendor.cover_image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    : <Text style={{ fontSize: 28 }}>🏪</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#261812', marginBottom: 2 }}>
                    {vendor.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#5a4136', marginBottom: 6 }}>
                    {vendor.cuisine_tags?.[0] ?? t('home.thaiFood')}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={{
                      backgroundColor: vendor.is_open === true ? '#e7f5e9' : '#e7ded9',
                      borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
                    }}>
                      <Text style={{ fontSize: 10, color: '#565656' }}>{statusLine(vendor)}</Text>
                    </View>
                    {vendor.is_halal_certified === true && (
                      <View style={{ backgroundColor: '#ffeae1', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color: '#565656' }}>{t('common.halal')}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Tap>
            ))}

            {results.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>🏪</Text>
                <Text style={{ color: Brand.textSecondary, textAlign: 'center' }}>{t('stores.noneFound')}</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify `Brand` tokens exist**

Run: `grep -nE 'textPrimary|textSecondary|orange|orangeLight|border|card|bg' src/constants/theme.ts`
Expected: `bg`, `card`, `orange`, `orangeLight`, `border`, `textPrimary`, `textSecondary` all present. If any name differs, update the reference in `stores.tsx` to the real token name (do NOT invent a hex value).

- [ ] **Step 3: Verify `t('common.halal')` exists**

Run: `grep -n "'common.halal'" src/lib/i18n/en.ts`
Expected: one hit. (`search.tsx` already uses it, so it should exist.)

- [ ] **Step 4: Lint + typecheck**

Run: `npm run lint`
Expected: no errors, no `any`. If the `.select(VENDOR_FIELDS)` result type does not narrow to `Vendor[]` and TS complains at `data as Vendor[]`, change that one cast to `data as unknown as Vendor[]` (matching the pattern at `search.tsx:82`) and re-run.

- [ ] **Step 5: Manual smoke test**

Run: `npx expo start` (or reload a running dev client). In the app, manually navigate to `/stores` (temporarily add a `router.push('/stores')` somewhere, or wait for Task 3). Verify:
- List shows more than 6 stores; open stores appear before closed ones.
- A closed store renders at half opacity with a "Closed" badge and still opens its `/store/[id]` on tap.
- An open store with `current_queue_count = 0` (or null `estimated_wait_min`) shows "No queue"; one with a queue and a wait shows "~N min wait".
- Typing a name fragment narrows the list; the clear `×` restores it.
- Toggling "Halal certified" filters to halal-certified stores only.
- No match → 🏪 + "No stores match".
- Switch language to Thai (profile screen) → title, placeholder, chip, badges all translate.

- [ ] **Step 6: Commit**

```bash
git add src/app/stores.tsx
git commit -m "feat(stores): add /stores vendor directory screen"
```

---

## Task 3: Add "See all" link to home Store Options

**Files:**
- Modify: `src/app/(tabs)/index.tsx` (the `{/* Store Options */}` block, ~lines 551-555)

**Interfaces:**
- Consumes: `t('home.seeAll')` from Task 1; `StoresScreen` route `/stores` from Task 2; `router` (already imported at `index.tsx:5`), `Tap` (already imported at `index.tsx:3`).
- Produces: nothing downstream.

- [ ] **Step 1: Replace the Store Options heading with a heading + See-all row**

In `src/app/(tabs)/index.tsx`, find:

```tsx
        {/* Store Options */}
        <View>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812', marginBottom: 16 }}>
            {t('home.storeOptions')}
          </Text>
```

Replace those lines with:

```tsx
        {/* Store Options */}
        <View>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812' }}>
              {t('home.storeOptions')}
            </Text>
            {vendors.length > 0 && (
              <Tap onPress={() => router.push('/stores')} haptic={false}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: Brand.orange }}>
                  {t('home.seeAll')} ›
                </Text>
              </Tap>
            )}
          </View>
```

Leave the rest of the block (`<View style={{ gap: 12 }}>`, `vendors.slice(0, 6).map(...)`, the `vendors.length === 0` empty state, and the two closing `</View>` tags) unchanged.

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint`
Expected: no errors. `Brand` is already imported at `index.tsx:8`; `router` at line 5; `Tap` at line 3 — no new imports needed.

- [ ] **Step 3: Manual test**

Reload the app on the Home tab:
- "Store Options" heading now has "See all ›" on the right in orange.
- Tapping it opens the `/stores` screen from Task 2; back returns to Home.
- With stores present, the link shows; the `vendors.slice(0, 6)` list below is unchanged (still max 6).

- [ ] **Step 4: Commit**

```bash
git add src/app/(tabs)/index.tsx
git commit -m "feat(home): link Store Options section to full /stores directory"
```

---

## Self-Review

**Spec coverage:**
- New screen `src/app/stores.tsx`, auto-routed, no `_layout` change → Task 2 (+ Global Constraints).
- Query: all vendors, no `is_open` filter, `is_open desc` then `current_queue_count asc` → Task 2 Step 1.
- Focus refetch via `useFocusGuard` + `useFocusEffect` → Task 2 Step 1 (+ Global Constraints).
- Local `Vendor` type, no `any` → Task 2 Step 1 + Step 4.
- Error posture: `setVendors([])`, stop loading → Task 2 Step 1 (`error || !data ? []`).
- Layout mirrors `search.tsx` (SafeAreaView top edge, header, pill search field, clear ×, filter chip row, spinner, ScrollView + count line) → Task 2 Step 1.
- Search field `autoFocus` off → Task 2 Step 1 (no `autoFocus` prop).
- Single "Halal certified" chip toggling like search diet chips → Task 2 Step 1.
- Row card reuses home Store Options visual (62px tile, 🏪 fallback, name, cuisine subtitle, halal badge) → Task 2 Step 1.
- Status line: closed badge / "No queue" / "~N min wait" with null-wait fallback to "No queue" → Task 2 `statusLine()`.
- Closed rows `opacity: 0.5`, still tappable to `/store/[id]` → Task 2 Step 1.
- Client-side `useMemo` filter (halal + name substring), query order preserved (no client re-sort) → Task 2 `results`.
- Empty state: 🏪 32px + `stores.noneFound`, `paddingVertical: 60` → Task 2 Step 1.
- Home: heading → flex row with right-aligned See-all tap → `/stores`, shown when `vendors.length > 0`, `slice(0, 6)` unchanged → Task 3.
- i18n: 9 keys (`home.seeAll` + 8 `stores.*`) in both `en.ts` and `th.ts` → Task 1. (Spec listed 8 + optional `stores.resultsCount`; plan makes `resultsCount` non-optional since `search.resultsCount` = "{n} dishes found" does not fit — 9 total.)
- Known issue (`cuisine_tags` fallback) carried over verbatim, not fixed → Task 2 Step 1 (`?? t('home.thaiFood')`), noted here.

**Placeholder scan:** none — every code step has full literal content.

**Type consistency:** `Vendor` fields (`is_open`, `is_halal_certified`, `current_queue_count`, `estimated_wait_min`, `cuisine_tags`, `cover_image_url`) match the `.select(VENDOR_FIELDS)` string and the ERD in CLAUDE.md. `statusLine(v: Vendor): string` used only within Task 2. Route string `/stores` identical in Task 2 (file path) and Task 3 (`router.push`). i18n key names identical between Task 1 (definition) and Tasks 2-3 (use).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-31-all-stores-list-screen.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
