# Vendor profile view/edit

## Problem

The vendor topbar avatar circle (initials, e.g. "M") in `(vendor)/_layout.tsx` is decorative —
not tappable. Vendors have no way to view or edit their own store profile (name, stall number,
bio, cuisine tags, halal certification, operating hours). `vendorProfile` in `vendor-store.ts`
only tracks `id, name, estimated_wait_min, current_queue_count` — enough to run the shell, not
enough to edit a profile.

## Design

### `src/lib/vendor-store.ts`

- Extend `VendorProfile` type with: `stall_number: string | null`, `bio: string | null`,
  `cuisine_tags: string[]`, `is_halal_certified: boolean`, `open_time: string | null`,
  `close_time: string | null`.
- Extend the `initVendorSession` select query to fetch these columns.
- Add `updateVendorProfile(patch: Partial<...>): Promise<boolean>` — optimistic local update,
  `supabase.from('vendors').update(patch).eq('id', vendorProfile.id)`, revert + `showAlert` on
  error (same shape as `setStoreOpen`). Returns success boolean so the screen knows whether to
  navigate back.

### `src/app/(vendor)/profile.tsx` (new screen)

Always-editable form, styled like `(vendor)/menu/new.tsx` (plain `TextInput`s in bordered boxes,
vendor-accent Save button at the bottom). Pre-filled from `useVendorProfile()`:

- Name (`TextInput`)
- Stall number (`TextInput`)
- Bio (`TextInput`, multiline)
- Cuisine tags (`TextInput`, comma-separated; split/trim to `string[]` on save, join with `', '`
  to prefill)
- Open time / Close time (two `TextInput`s, free-text `HH:MM`, no picker widget)
- Halal certified (`Switch`)
- Save button: calls `updateVendorProfile`, shows success alert, `router.back()`. Disabled
  while saving (`saving` state), same as `menu/new.tsx`'s save button.

Renders inside the existing `VendorLayout` shell (topbar/nav stay visible) since it's a route
under `(vendor)/`, same as `menu/new.tsx` today.

### `src/app/(vendor)/_layout.tsx`

Wrap the existing avatar `View` (topbar, ~line 214) in a `TouchableOpacity` with
`onPress={() => router.push('/(vendor)/profile' as any)}`. No visual change to the avatar
itself.

### `src/lib/i18n/en.ts` / `th.ts`

New `vendor.profile.*` keys following the existing `vendor.menuNew.*` naming pattern: title,
field labels/placeholders, save button label + saving state, saved confirmation message.

## Out of scope

- No cover image upload (deferred — user chose "core info only").
- No time-picker widget for open/close time — plain text input.
- No separate read-only "view" mode — form is always editable, matching `menu/new.tsx`.
- No changes to the Help Center row (already has no `onPress` — not part of this task).
