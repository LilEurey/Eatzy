# Vendor Store Location — Interactive Map (Design)

**Date:** 2026-09-08
**Status:** Approved, ready for implementation plan

## Context

The advisor asked for a store-location map: a vendor pins their stall on a map, and students see
where the stall is. Eatzy targets international students who struggle to find the right stall in
KMUTT's Thai canteens, so "where is this stall" is a core pain point.

Today `vendors` carries three plain location columns — `is_on_campus` (bool), `stall_number` (text),
`address` (text) — edited as a free-text form on `src/app/(vendor)/profile.tsx`. There are **no**
coordinate columns and **no** map anywhere in the app. The only student-facing location surface is a
`stall_number` string in `src/app/cart.tsx`. `react-native-maps` and `expo-location` are not
installed.

**Outcome:** vendors drop a GPS pin for their stall; students see a small non-interactive map with
that pin on the store detail screen. Existing `stall_number` / `address` text stays as-is alongside
it.

## Decisions

- Interactive GPS map via `react-native-maps` (Apple Maps, `PROVIDER_DEFAULT`) + `expo-location`.
- Requires a development build — **not** Expo Go. The EAS `development` profile already exists.
- iOS-first (matches `eas.json`). Android map works if a dev build is made for it but is not a
  deliverable here; the web preview must not crash.
- Vendor sets the pin by dragging/tapping a full map **plus** a "use my current location" button.
- Student sees a **mini map only** (pin + optional blue dot), no external Apple/Google Maps handoff.
- Seeded vendors are left with null coordinates — the map section simply hides for them.

## Architecture

Three isolated units:

1. **Data** — two nullable coordinate columns on `vendors`; no PostGIS, no geocoding. Coordinates
   round-trip as plain `double precision`.
2. **Vendor pin picker** — a standalone screen that owns reading current coords, capturing a new
   point (map gesture or device GPS), and writing back via the existing `updateVendorProfile`
   patch path. Depends on `react-native-maps`, `expo-location`, `vendor-store.ts`.
3. **Student map view** — a read-only section on the store detail screen that renders a marker from
   `vendor.latitude` / `vendor.longitude`. Depends on `react-native-maps` only; no write path, no
   permission prompt.

The vendor picker and student view never share state — they communicate only through the `vendors`
row.

## Components

### 1. Dependencies + native config

- `npx expo install react-native-maps expo-location`
- `app.json`:
  - add `expo-location` to `plugins` with a single generic `NSLocationWhenInUseUsageDescription`
    covering both roles, e.g. *"Eatzy uses your location to place your store on the campus map and
    to show where you are relative to a stall."*
  - `react-native-maps` needs no key for Apple Maps; add its config plugin only if the install does
    not auto-add it.
- Update `CLAUDE.md` and `README` where they say "scan QR with Expo Go" to note the map feature
  needs a dev client.

### 2. Data model

New migration `supabase/migrations/<timestamp>_vendor_geo.sql`:

```sql
alter table public.vendors
  add column latitude  double precision,
  add column longitude double precision;
```

- Nullable, no default, no PostGIS.
- Regenerate `src/types/database.types.ts` (`npx supabase gen types typescript --local`).
- Add `latitude`, `longitude` to the `vendors` ERD line in `CLAUDE.md` and `AGENTS.md`.
- Migration joins the pending hosted `db push` backlog.

### 3. `src/lib/vendor-store.ts`

- Add `latitude: number | null; longitude: number | null` to the `VendorProfile` type.
- Add both to the `.select('...')` column list in `initVendorSession()` and to the mapping into
  `vendorProfile`.
- Add both to `VendorProfilePatch` (`Pick<VendorProfile, ... | 'latitude' | 'longitude'>`).
- `updateVendorProfile()` already does a generic `.update(patch)` — no change there.

### 4. Vendor pin picker — new screen `src/app/(vendor)/profile/location.tsx`

- Full-screen `MapView` (`provider={PROVIDER_DEFAULT}`), initial region = vendor's saved coords,
  else a hardcoded KMUTT campus region constant `KMUTT_REGION` (new `src/constants/geo.ts`).
- One draggable `<Marker>`; both `onDragEnd` and map `onPress` update local
  `{ latitude, longitude }` state.
- "Use my current location" button:
  - `Location.requestForegroundPermissionsAsync()` → if granted, `getCurrentPositionAsync()`,
    animate the map to the point and move the marker.
  - denied → inline notice ("Location permission off — tap the map to place your pin instead");
    manual placement still works.
- Save → `await updateVendorProfile({ latitude, longitude })` then `router.back()`. Reuse the
  existing alert-on-error path inside `updateVendorProfile`.
- `Platform.OS === 'web'` → render a "Open this screen on the app to set your location" message
  instead of `MapView`.

### 5. `src/app/(vendor)/profile.tsx`

- Add a "Store location" row after the address/stall block: label + status text
  (`profile.latitude != null ? 'Pinned' : 'Not set'`) + a press that
  `router.push('/(vendor)/profile/location')`.
- No new save logic here — the picker screen owns the write.

### 6. `src/app/store/[id].tsx` (student store detail)

- After the bio block, a "Where to find it" section, rendered only when
  `vendor.latitude != null && vendor.longitude != null && Platform.OS !== 'web'`:
  - `<MapView>` ~160px tall, `scrollEnabled={false}`, `zoomEnabled={false}`,
    `pointerEvents="none"`, region centered on the vendor coords with a tight delta.
  - single non-draggable `<Marker>` at the vendor coords.
  - `showsUserLocation` only if permission is **already** granted — check with
    `Location.getForegroundPermissionsAsync()` on mount; never call
    `requestForegroundPermissionsAsync` from this screen.
  - `vendor.stall_number` text under the map (the existing cart display is untouched).
- `vendor` already comes from `select('*')`, so the coordinates arrive with no query change once
  types are regenerated.

## Data flow

1. Vendor opens the picker → screen seeds the marker from `vendorProfile.latitude/longitude` or
   `KMUTT_REGION`.
2. Vendor drags/taps the map, or taps "use my location" → local state updates.
3. Save → `updateVendorProfile({ latitude, longitude })` → optimistic local merge + `vendors`
   update → `router.back()`.
4. Student opens the store screen → `select('*')` returns the coords → section renders the marker.

## Error handling / edge cases

- **Null coords** → student: section not rendered; vendor: row shows "Not set".
- **Location permission denied** → vendor picker still works via map gesture; student map just omits
  the blue dot.
- **Web** (`expo start --web`) → `react-native-maps` has no web view; both surfaces guard with
  `Platform.OS !== 'web'` so the preview does not crash.
- **Save failure** → existing `updateVendorProfile` reverts the optimistic merge and shows
  "Could not save profile".

## Testing

1. `npm run lint` and `npx tsc --noEmit` clean.
2. Build/run a dev client: `npx expo run:ios` (or the EAS `development` profile).
3. Vendor flow: log in as a vendor → Profile → Store location → drag the pin, then tap "Use my
   current location" (grant permission) → Save → row shows "Pinned".
4. Student flow: open that vendor's store screen → "Where to find it" mini map renders with the
   marker at the saved point; `stall_number` shows under it.
5. Open a different vendor with null coords → no map section appears.
6. Deny location permission, redo the vendor flow → inline notice shows, tapping the map still
   places the pin and Save works.
7. `npx expo start --web` → store screen and vendor profile load without a `react-native-maps`
   crash.
8. After hosted `npx supabase db push`, confirm `vendors.latitude` / `longitude` exist and saved
   values round-trip.

## Out of scope

- Turn-by-turn / external maps handoff.
- Android as a shipped target.
- Seeding coordinates for the 16 existing vendors.
- Distance sorting, "stalls near me", PostGIS.
