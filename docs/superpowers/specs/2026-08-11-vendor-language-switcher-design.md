# Vendor language switcher

## Problem

`src/lib/i18n` already provides full EN/TH translation infra (`useI18n`, `setLocale`,
`LOCALE_LABELS`, persisted via AsyncStorage), and every vendor screen already calls `t(...)`.
But there is no UI on the vendor side to change locale — only the student Profile tab
(`src/app/(tabs)/profile.tsx`) has a language picker. Vendors are stuck on whatever locale
was last set (default `en`), with no way to switch to Thai.

## Design

Add a language pill button to the vendor topbar in `src/app/(vendor)/_layout.tsx`, next to
the existing store-open pill. The topbar renders in every layout variant (phone bottom-tab,
tablet drawer, desktop sidebar), so this is the one place guaranteed visible regardless of
screen size.

- **Pill button**: globe icon (`Ionicons` `globe-outline`) + current `LOCALE_LABELS[locale]`
  text. Text hidden below `isTablet` breakpoint, matching how the store-open pill already
  hides its label on phones. Tapping opens a modal picker.
- **Modal picker**: reuse the exact pattern already in `profile.tsx` (lines ~434-472) — title
  row + one row per `Locale` in `LOCALE_LABELS`, checkmark on the active one, tap calls
  `setLocale(code)` and closes. Reuse the existing `profile.languagePickerTitle` translation
  key for the title; no new keys needed since `LOCALE_LABELS` and modal copy already exist.
- **State**: a local `langPickerOpen` boolean in `VendorLayout`, alongside the existing
  `drawerOpen` state.

No changes to `src/lib/i18n/*` — the infra already supports this; this is UI wiring only.

## Out of scope

- No new translation keys.
- No settings screen — topbar pill only, consistent with student side using Profile tab but
  vendor side having no settings/profile screen yet.
- No change to default locale or persistence behavior.
