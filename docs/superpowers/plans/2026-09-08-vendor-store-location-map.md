# Vendor Store Location Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a vendor pin their stall's GPS location on a map, and show students a read-only mini map with that pin on the store detail screen.

**Architecture:** Two nullable `double precision` columns on `vendors` (`latitude`, `longitude`) hold the point — no PostGIS, no geocoding. A standalone vendor picker screen captures a point via map gesture or device GPS and writes it through the existing `updateVendorProfile` patch path. The student store screen renders a non-interactive `MapView` marker from the row. The vendor picker and student view share nothing but the `vendors` row.

**Tech Stack:** React Native 0.81 + Expo SDK 54, Expo Router, `react-native-maps` (Apple Maps `PROVIDER_DEFAULT`), `expo-location`, Supabase JS, NativeWind v4, Jest + ts-jest.

## Global Constraints

- Expo SDK 54 — use `npx expo install` for native deps so versions match. Check https://docs.expo.dev/versions/v54.0.0/ before writing Expo/RN code.
- `tsconfig.json` has `strict: true` — no `any`, no `@ts-ignore`. Proper types.
- NativeWind v4 utility classes for all styling. Follow existing screen structure (`Tap` component, `Brand` tokens from `@/constants/theme`, `useI18n`).
- iOS-first (matches `eas.json`). Map view uses `PROVIDER_DEFAULT` (Apple Maps) — no Google API key.
- `react-native-maps` has no web renderer: every surface that mounts `MapView` must guard `Platform.OS !== 'web'` so `npx expo start --web` does not crash.
- `react-native-maps` requires a development build — not Expo Go. `expo-dev-client` is already a dependency; the EAS `development` profile already exists.
- Student store screen must NEVER call `Location.requestForegroundPermissionsAsync()` — read-only permission check only.
- Location permission usage string (`NSLocationWhenInUseUsageDescription`), verbatim: `Eatzy uses your location to place your store on the campus map and to show where you are relative to a stall.`
- Migration files are timestamp-prefixed; latest existing is `20260904010000`. Use `20260908000000_vendor_geo.sql`.
- Commit after each task. Branch is `feat/vendor-store-location-map` (already created).
- Full test/lint cycle: `npm test`, `npm run lint`, `npx tsc --noEmit`.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` / `package-lock.json` | add `react-native-maps`, `expo-location` |
| `app.json` | `expo-location` config plugin + iOS usage string |
| `supabase/migrations/20260908000000_vendor_geo.sql` | new — add `latitude`, `longitude` columns |
| `src/types/database.types.ts` | regenerated — `vendors` Row/Insert/Update gain the two fields |
| `src/lib/geo.ts` | new — `KMUTT_REGION` constant + `hasCoords` guard + `regionForCoords` helper (pure, unit-tested) |
| `src/lib/__tests__/geo.test.ts` | new — tests for `src/lib/geo.ts` |
| `src/lib/vendor-store.ts` | `VendorProfile` type, `initVendorSession` select + mapping, `VendorProfilePatch` — all gain `latitude`/`longitude` |
| `src/lib/__tests__/vendor-store.test.ts` | add a case: `updateVendorProfile` forwards coords in the patch |
| `src/app/(vendor)/profile/location.tsx` | new — full-screen map pin picker + "use my location" |
| `src/app/(vendor)/profile.tsx` | add a "Store location" row linking to the picker |
| `src/app/store/[id].tsx` | add a read-only "Where to find it" mini-map section |
| `CLAUDE.md` / `AGENTS.md` | `vendors` ERD line gains `latitude`, `longitude`; note map needs a dev client |
| `README` (if it mentions Expo Go) | note map feature needs a dev client |

---

## Task 1: Dependencies + native config

**Files:**
- Modify: `package.json`, `package-lock.json` (via installer)
- Modify: `app.json`
- Modify: `CLAUDE.md`, `AGENTS.md` (Expo Go note only; ERD line is Task 2)
- Modify: `README.md` (only if it references Expo Go)

**Interfaces:**
- Consumes: nothing.
- Produces: `react-native-maps` (`MapView`, `Marker`, `PROVIDER_DEFAULT` exports) and `expo-location` (`requestForegroundPermissionsAsync`, `getForegroundPermissionsAsync`, `getCurrentPositionAsync`) importable in later tasks. iOS Info.plist gets `NSLocationWhenInUseUsageDescription`.

- [ ] **Step 1: Install the native deps**

Run:
```bash
npx expo install react-native-maps expo-location
```
Expected: both added to `package.json` `dependencies` at SDK-54-compatible versions; lockfile updated.

- [ ] **Step 2: Add the expo-location plugin + usage string to `app.json`**

In `app.json`, add to the `expo.plugins` array (create nothing else):
```json
[
  "expo-location",
  {
    "locationWhenInUsePermission": "Eatzy uses your location to place your store on the campus map and to show where you are relative to a stall."
  }
]
```
Also confirm `expo.ios.infoPlist.NSLocationWhenInUseUsageDescription` is not set to a conflicting value; if an `infoPlist` block exists, set that key to the same string. `react-native-maps` needs no plugin entry for Apple Maps — only add one if `npx expo install` printed a prompt to.

- [ ] **Step 3: Update the Expo Go notes in docs**

In `CLAUDE.md` and `AGENTS.md`, near the `npx expo start` / "scan QR with Expo Go" line, add:
> The store-location map (`react-native-maps`) needs a development build — run `npx expo run:ios` or an EAS `development` build, not Expo Go.

If `README.md` mentions Expo Go for running the app, add the same note there. If it does not, skip it.

- [ ] **Step 4: Typecheck + lint**

Run:
```bash
npx tsc --noEmit && npm run lint
```
Expected: PASS. (No source imports the new deps yet; this only verifies the install + `app.json` are well-formed.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.json CLAUDE.md AGENTS.md README.md
git commit -m "chore: add react-native-maps + expo-location for store location"
```

---

## Task 2: Database migration + regenerated types + ERD

**Files:**
- Create: `supabase/migrations/20260908000000_vendor_geo.sql`
- Modify: `src/types/database.types.ts` (regenerated)
- Modify: `CLAUDE.md`, `AGENTS.md` (ERD line)

**Interfaces:**
- Consumes: nothing.
- Produces: `Database['public']['Tables']['vendors']['Row']` gains `latitude: number | null` and `longitude: number | null` (and the same optional in `Insert` / `Update`). Later tasks read these off the `select('*')` row in `src/app/store/[id].tsx` and reference the column names in `src/lib/vendor-store.ts`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260908000000_vendor_geo.sql`:
```sql
-- Vendor store location: optional GPS pin dropped by the vendor, shown to students
-- as a read-only mini map on the store detail screen. Nullable; no PostGIS.
alter table public.vendors
  add column latitude  double precision,
  add column longitude double precision;
```

- [ ] **Step 2: Apply locally and regenerate types**

Run:
```bash
npx supabase db reset   # or `npx supabase migration up` if a local stack is already running
npx supabase gen types typescript --local > src/types/database.types.ts
```
Expected: `src/types/database.types.ts` diff shows `latitude` / `longitude` added to `vendors` `Row`, `Insert`, `Update`.

If no local Supabase stack is available, hand-edit `src/types/database.types.ts`: add `latitude: number | null` and `longitude: number | null` to the `vendors` `Row` block, and `latitude?: number | null` / `longitude?: number | null` to its `Insert` and `Update` blocks. Keep alphabetical ordering consistent with the surrounding fields.

- [ ] **Step 3: Update the ERD line in the docs**

In `CLAUDE.md` and `AGENTS.md`, the `vendors` line under `## Data Model` — add `latitude`, `longitude` to the field list, after `address`:
> **vendors** — id, name, stall_number, is_on_campus, address, latitude, longitude, is_halal_certified, ...

- [ ] **Step 4: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260908000000_vendor_geo.sql src/types/database.types.ts CLAUDE.md AGENTS.md
git commit -m "feat(db): add latitude/longitude to vendors"
```

---

## Task 3: `src/lib/geo.ts` pure helpers (TDD)

**Files:**
- Create: `src/lib/geo.ts`
- Test: `src/lib/__tests__/geo.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `KMUTT_REGION: Region` — `{ latitude: 13.6512, longitude: 100.4967, latitudeDelta: 0.012, longitudeDelta: 0.012 }` (KMUTT Bang Mod campus center; deltas ≈ campus-wide zoom).
  - `type LatLng = { latitude: number; longitude: number }`
  - `hasCoords(v: { latitude: number | null; longitude: number | null }): v is LatLng` — true only when both are finite numbers.
  - `regionForCoords(c: LatLng, delta?: number): Region` — returns `{ ...c, latitudeDelta: delta ?? 0.003, longitudeDelta: delta ?? 0.003 }` (tight single-stall zoom).
  - `Region` is imported from `react-native-maps` (`import type { Region } from 'react-native-maps'`).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/geo.test.ts`:
```ts
import { KMUTT_REGION, hasCoords, regionForCoords } from '@/lib/geo';

describe('hasCoords', () => {
  it('is true when both coordinates are finite numbers', () => {
    expect(hasCoords({ latitude: 13.65, longitude: 100.49 })).toBe(true);
  });
  it('is false when either coordinate is null', () => {
    expect(hasCoords({ latitude: 13.65, longitude: null })).toBe(false);
    expect(hasCoords({ latitude: null, longitude: 100.49 })).toBe(false);
    expect(hasCoords({ latitude: null, longitude: null })).toBe(false);
  });
  it('is false for NaN', () => {
    expect(hasCoords({ latitude: NaN, longitude: 100.49 })).toBe(false);
  });
});

describe('regionForCoords', () => {
  it('wraps a point in a tight default region', () => {
    expect(regionForCoords({ latitude: 13.65, longitude: 100.49 })).toEqual({
      latitude: 13.65,
      longitude: 100.49,
      latitudeDelta: 0.003,
      longitudeDelta: 0.003,
    });
  });
  it('honours a custom delta', () => {
    const r = regionForCoords({ latitude: 1, longitude: 2 }, 0.05);
    expect(r.latitudeDelta).toBe(0.05);
    expect(r.longitudeDelta).toBe(0.05);
  });
});

describe('KMUTT_REGION', () => {
  it('is centered on the Bang Mod campus with a campus-wide zoom', () => {
    expect(KMUTT_REGION.latitude).toBeCloseTo(13.6512, 3);
    expect(KMUTT_REGION.longitude).toBeCloseTo(100.4967, 3);
    expect(KMUTT_REGION.latitudeDelta).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- geo.test
```
Expected: FAIL — `Cannot find module '@/lib/geo'`.

- [ ] **Step 3: Write `src/lib/geo.ts`**

```ts
import type { Region } from 'react-native-maps';

export type LatLng = { latitude: number; longitude: number };

/** KMUTT Bang Mod campus center — fallback view when a vendor has no pin yet. */
export const KMUTT_REGION: Region = {
  latitude: 13.6512,
  longitude: 100.4967,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

/** Narrow a maybe-empty row to a concrete point. */
export function hasCoords(v: {
  latitude: number | null;
  longitude: number | null;
}): v is LatLng {
  return (
    typeof v.latitude === 'number' &&
    Number.isFinite(v.latitude) &&
    typeof v.longitude === 'number' &&
    Number.isFinite(v.longitude)
  );
}

/** Wrap a single point in a tight (single-stall) map region. */
export function regionForCoords(c: LatLng, delta = 0.003): Region {
  return { latitude: c.latitude, longitude: c.longitude, latitudeDelta: delta, longitudeDelta: delta };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm test -- geo.test && npx tsc --noEmit && npm run lint
```
Expected: PASS. If `tsc` cannot resolve `Region` from `react-native-maps`, confirm Task 1 installed it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo.ts src/lib/__tests__/geo.test.ts
git commit -m "feat(geo): add KMUTT region + coord helpers"
```

---

## Task 4: Thread coordinates through `vendor-store.ts`

**Files:**
- Modify: `src/lib/vendor-store.ts` (`VendorProfile` type ~L12-27; `initVendorSession` select ~L206 + mapping ~L211-224; `VendorProfilePatch` ~L365-367)
- Test: `src/lib/__tests__/vendor-store.test.ts`

**Interfaces:**
- Consumes: the regenerated `vendors` row from Task 2.
- Produces:
  - `VendorProfile` gains `latitude: number | null` and `longitude: number | null`.
  - `VendorProfilePatch` accepts `latitude` and `longitude`.
  - `useVendorProfile()` return value carries the two fields for Task 5.
  - `updateVendorProfile({ latitude, longitude })` writes both columns via the existing generic `.update(patch)`.

- [ ] **Step 1: Write the failing test**

In `src/lib/__tests__/vendor-store.test.ts`, add (adjust the mock import to whatever the file already uses to seed a `from().update()` result — the file already imports from `./__mocks__/supabase`):
```ts
import { updateVendorProfile } from '@/lib/vendor-store';
import { __setNextResult, __getFrom, __resetMock } from './__mocks__/supabase';

describe('updateVendorProfile coordinates', () => {
  beforeEach(() => __resetMock());

  it('forwards latitude and longitude in the vendors update patch', async () => {
    // initVendorSession must have populated vendorProfile first; if the mock
    // needs a session, seed it the same way the existing suite does.
    __setNextResult({ data: null, error: null });

    await updateVendorProfile({ latitude: 13.651, longitude: 100.497 });

    const call = __getFrom('vendors');
    expect(call.update).toEqual(
      expect.objectContaining({ latitude: 13.651, longitude: 100.497 }),
    );
  });
});
```
> If the existing mock exposes update-call capture under different helper names, use those. If `updateVendorProfile` early-returns because `vendorProfile` is null in the test, first drive `initVendorSession` (or the mock's session seeder) exactly as the existing tests in this file do, then assert. Do not weaken the assertion.

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm test -- vendor-store.test
```
Expected: FAIL — patch does not contain `latitude` / `longitude` (TypeScript also rejects the keys in `VendorProfilePatch`).

- [ ] **Step 3: Make the changes**

In `src/lib/vendor-store.ts`:

1. `VendorProfile` type — add after `address: string | null;`:
```ts
  latitude: number | null;
  longitude: number | null;
```

2. `initVendorSession` select string (~L206) — append `,latitude,longitude`:
```ts
    .select('id,name,estimated_wait_min,current_queue_count,is_open,is_on_campus,stall_number,address,latitude,longitude,bio,bio_th,cuisine_tags,is_halal_certified,open_time,close_time')
```

3. `vendorProfile = { ... }` mapping (~L211) — add after `address: vendor.address,`:
```ts
    latitude: vendor.latitude,
    longitude: vendor.longitude,
```

4. `VendorProfilePatch` (~L365) — add `| 'latitude' | 'longitude'` to the `Pick`:
```ts
type VendorProfilePatch = Partial<Pick<VendorProfile,
  'name' | 'is_on_campus' | 'stall_number' | 'address' | 'latitude' | 'longitude' | 'bio' | 'bio_th' | 'cuisine_tags' | 'is_halal_certified' | 'open_time' | 'close_time'
>>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm test -- vendor-store.test && npx tsc --noEmit && npm run lint
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vendor-store.ts src/lib/__tests__/vendor-store.test.ts
git commit -m "feat(vendor): thread lat/lng through vendor profile store"
```

---

## Task 5: Vendor pin picker screen + profile entry point

**Files:**
- Create: `src/app/(vendor)/profile/location.tsx`
- Modify: `src/app/(vendor)/profile.tsx` (add a "Store location" row)

**Interfaces:**
- Consumes: `useVendorProfile`, `updateVendorProfile` from `@/lib/vendor-store`; `KMUTT_REGION`, `regionForCoords`, `hasCoords`, `LatLng` from `@/lib/geo`; `MapView`, `Marker`, `PROVIDER_DEFAULT` from `react-native-maps`; `expo-location`.
- Produces: route `/(vendor)/profile/location`. No exported values.

- [ ] **Step 1: Build the picker screen**

Create `src/app/(vendor)/profile/location.tsx`. Follow the structure of `src/app/(vendor)/profile.tsx` (default export screen, `Tap` for buttons, `Brand` tokens, `useI18n`, `router.back()` on save). Requirements:

- `const vendor = useVendorProfile();`
- Local state: `const [point, setPoint] = useState<LatLng | null>(() => (vendor && hasCoords(vendor) ? { latitude: vendor.latitude, longitude: vendor.longitude } : null));`
- `const [permDenied, setPermDenied] = useState(false);` and `const [saving, setSaving] = useState(false);`
- `const mapRef = useRef<MapView>(null);`
- **Web guard:** `if (Platform.OS === 'web') return <View ...><Text>Open this screen on the Eatzy app to set your store location.</Text></View>;` — return before mounting `MapView`.
- `<MapView ref={mapRef} provider={PROVIDER_DEFAULT} style={{ flex: 1 }} initialRegion={point ? regionForCoords(point) : KMUTT_REGION} onPress={e => setPoint(e.nativeEvent.coordinate)}>` — render `<Marker draggable coordinate={point} onDragEnd={e => setPoint(e.nativeEvent.coordinate)} />` only when `point` is non-null.
- "Use my current location" button (`Tap`):
  ```ts
  async function useMyLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setPermDenied(true); return; }
    setPermDenied(false);
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    setPoint(next);
    mapRef.current?.animateToRegion(regionForCoords(next), 400);
  }
  ```
- When `permDenied`, render an inline `<Text>`: `Location permission is off — tap the map to place your pin instead.`
- "Save" button: disabled when `point == null || saving`. On press:
  ```ts
  setSaving(true);
  const ok = await updateVendorProfile({ latitude: point.latitude, longitude: point.longitude });
  setSaving(false);
  if (ok) router.back();
  ```
  (`updateVendorProfile` already shows its own error alert.)
- A short helper line at top: `Drag the pin or tap the map to mark where your stall is.`
- Use existing i18n keys where obvious; for new strings add keys to `src/lib/i18n` following the `vendor.profile.*` namespace (e.g. `vendor.location.hint`, `vendor.location.useMyLocation`, `vendor.location.permDenied`, `vendor.location.save`, `vendor.location.webOnly`). Add them to every locale file the repo keeps in sync.

- [ ] **Step 2: Add the entry row to `profile.tsx`**

In `src/app/(vendor)/profile.tsx`, after the address/stall block (around the `address` `TextInput`, before `bio`), add a `Tap` row:
```tsx
<Tap onPress={() => router.push('/(vendor)/profile/location')} className="...row styling like other rows...">
  <Text>{t('vendor.location.rowLabel')}</Text>
  <Text>{vendor && hasCoords(vendor) ? t('vendor.location.pinned') : t('vendor.location.notSet')}</Text>
  <Ionicons name="chevron-forward" ... />
</Tap>
```
Import `hasCoords` from `@/lib/geo`. Add i18n keys `vendor.location.rowLabel` ("Store location"), `vendor.location.pinned` ("Pinned"), `vendor.location.notSet` ("Not set"). This row navigates only — it does not participate in the screen's `save()`.

- [ ] **Step 3: Typecheck + lint + existing tests**

Run:
```bash
npx tsc --noEmit && npm run lint && npm test
```
Expected: PASS. No new unit test — the screen is verified manually in Step 4 (no jest renderer for `react-native-maps` in this repo).

- [ ] **Step 4: Manual verification on a dev build**

Run `npx expo run:ios` (or install the EAS `development` build). Then:
1. Log in as a vendor → Profile → tap "Store location" → row currently reads "Not set".
2. Picker opens on the KMUTT region. Tap the map → a pin appears. Drag it → it moves.
3. Tap "Use my current location" → grant permission → map animates to your location, pin moves there.
4. Tap "Save" → returns to Profile → row now reads "Pinned".
5. Re-open the picker → it opens zoomed to the saved pin.
6. Kill permission (Settings → Eatzy → Location → Never), re-open picker, tap "Use my current location" → inline "permission is off" notice; tapping the map still places a pin and Save still works.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(vendor)/profile/location.tsx" "src/app/(vendor)/profile.tsx" src/lib/i18n
git commit -m "feat(vendor): map screen to pin store location"
```

---

## Task 6: Student "Where to find it" mini map

**Files:**
- Modify: `src/app/store/[id].tsx` (add a section after the bio block, ~L229-231)

**Interfaces:**
- Consumes: `vendor.latitude` / `vendor.longitude` (already on the `select('*')` row after Task 2); `MapView`, `Marker`, `PROVIDER_DEFAULT` from `react-native-maps`; `hasCoords`, `regionForCoords` from `@/lib/geo`; `expo-location` (`getForegroundPermissionsAsync` only).
- Produces: nothing.

- [ ] **Step 1: Add permission-check state**

Near the other `useState` hooks in the screen, add:
```ts
const [canShowUser, setCanShowUser] = useState(false);
useEffect(() => {
  if (Platform.OS === 'web') return;
  Location.getForegroundPermissionsAsync().then(p => setCanShowUser(p.status === 'granted')).catch(() => {});
}, []);
```
Do NOT call `requestForegroundPermissionsAsync` anywhere in this file.

- [ ] **Step 2: Render the section**

After the bio block, add — only rendering when there is a pin and not on web:
```tsx
{Platform.OS !== 'web' && hasCoords(vendor) && (
  <View className="...section styling matching neighbors...">
    <Text className="...section heading style...">{t('store.whereToFind')}</Text>
    <View className="rounded-2xl overflow-hidden" style={{ height: 160 }}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        pointerEvents="none"
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation={canShowUser}
        region={regionForCoords({ latitude: vendor.latitude, longitude: vendor.longitude })}
      >
        <Marker coordinate={{ latitude: vendor.latitude, longitude: vendor.longitude }} title={vendor.name} />
      </MapView>
    </View>
    {vendor.stall_number ? (
      <Text className="...caption style...">{t('store.stall', { n: vendor.stall_number })}</Text>
    ) : null}
  </View>
)}
```
Add i18n keys `store.whereToFind` ("Where to find it") and, if not already present, `store.stall` ("Stall {{n}}") to every locale file. Reuse `cart.stall`'s wording for consistency.

- [ ] **Step 3: Typecheck + lint + tests**

Run:
```bash
npx tsc --noEmit && npm run lint && npm test
```
Expected: PASS. `hasCoords(vendor)` also narrows `vendor.latitude`/`longitude` to `number` for the `Marker` props — if `tsc` still complains, assign `const { latitude, longitude } = vendor;` inside the guarded block after an explicit `hasCoords` check.

- [ ] **Step 4: Manual verification on a dev build**

1. Open the store screen for the vendor you pinned in Task 5 → "Where to find it" section shows a mini map with the marker at the saved spot; the map does not scroll or zoom; stall number shows beneath it if set.
2. Open a store for a vendor with no pin (any seeded vendor) → no "Where to find it" section.
3. If location permission is granted app-wide, the blue user dot appears on the mini map; if not, only the marker shows and there is no permission prompt.
4. `npx expo start --web` → open a store screen → page renders, no `react-native-maps` crash, no map section.

- [ ] **Step 5: Commit**

```bash
git add "src/app/store/[id].tsx" src/lib/i18n
git commit -m "feat(store): show vendor location mini map to students"
```

---

## Post-implementation

- Push the branch and open a PR against `main`.
- The new migration `20260908000000_vendor_geo.sql` is not yet applied to the hosted DB — it joins the pending `npx supabase db push` backlog. After push, verify `vendors.latitude` / `longitude` exist and a saved pin round-trips (pin as vendor, reload store screen as student).
- Update the memory note `allergen-backfill-and-enrichment-bug` (or add a new one) to include this migration in the pending-push list.

## Self-Review

- **Spec coverage:** deps/config → Task 1; data model → Task 2; `vendor-store.ts` plumbing → Task 4; `KMUTT_REGION` + guards → Task 3; vendor picker (drag/tap + use-my-location + web guard + permission-denied) → Task 5; profile entry row → Task 5; student mini map (null-guard, already-granted-only, web guard, stall text) → Task 6; Expo Go doc note → Task 1; ERD update → Task 2. All spec sections covered.
- **Placeholder scan:** styling classes are described as "matching neighbors" because this repo's NativeWind class strings must be copied from the actual adjacent JSX at edit time — the behavior (heights, guards, props) is fully specified. No TBD/TODO logic.
- **Type consistency:** `LatLng`, `hasCoords`, `regionForCoords`, `KMUTT_REGION` defined in Task 3 and consumed with the same names/signatures in Tasks 5–6. `VendorProfilePatch` key list extended consistently in Task 4 and used in Task 5. `Region` sourced from `react-native-maps` throughout.
