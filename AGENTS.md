# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Expo SDK 54** is in use — always check versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing Expo/RN code.

## Project Overview

Eatzy is a campus food ordering & recommendation app ("Fuel your day the easy way") for KMUTT's student food ecosystem — targeting international students dealing with language barriers, missing ingredient info, and dietary filtering in Thai canteens.

**Core features:** smart ML recommendations, pre-order by time slot, dietary/allergy filtering, vendor management, escrow-based Campus Wallet payments.

## Tech Stack

- **Frontend:** React Native + Expo (SDK 54), Expo Router, NativeWind v4 (Tailwind CSS)
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime, RPC/database functions)
- **ML:** Python, pandas, scikit-learn (TF-IDF + cosine similarity for content-based; collaborative filtering for "because you ordered")
- **Infra:** GitHub, Expo EAS

## Commands

```bash
npx expo start          # Start dev server (scan QR with Expo Go)
npx expo start --ios    # Open in iOS Simulator
npx expo start --android
npx expo start --web    # Web preview
npm run lint            # ESLint
npm run reset-project    # Reset to blank starter app/ (scripts/reset-project.js)
npx supabase db push    # Apply pending migrations (requires Supabase CLI)
npx supabase gen types typescript --local > src/types/database.types.ts  # Regenerate DB types
eas build --platform ios --profile preview   # EAS build (see eas.json: development/preview/production)
eas submit --platform ios --profile production
```

## Project Structure

```
Eatzy/
├── src/
│   ├── app/              # Expo Router pages (file-based routing)
│   │   ├── (tabs)/       # Student tabs — home, orders, wallet, profile
│   │   ├── (vendor)/     # Vendor dashboard — index.tsx redirects to overview; orders, menu, analytics, profile, notifications (real Supabase, not mock)
│   │   ├── (admin)/      # Admin portal — create vendor store accounts + vendor store monitoring/force open-close (email/password auth, not Google)
│   │   ├── (auth)/       # Login/onboarding stack
│   │   ├── admin-login.tsx, vendor-login.tsx, cart.tsx, edit-preferences.tsx, notifications.tsx, search.tsx  # Public entry points outside the tab groups
│   │   └── store/, item/, track/, rate/  # Detail screens
│   ├── components/       # Reusable RN components (Tap, PillDropdown)
│   ├── hooks/            # useGoogleSignIn, useFocusGuard (blur/unmount race guard)
│   ├── constants/        # theme.ts (Brand colors/tokens)
│   ├── lib/
│   │   ├── supabase.ts   # Supabase client singleton
│   │   ├── i18n/         # Translation strings, useI18n hook
│   │   ├── localize.ts   # Thai dish-name fallback (name_th/description_th) + notification text rendering — see Localization below
│   │   ├── cart-store.ts, vendor-store.ts  # useSyncExternalStore-based client state
│   │   ├── edge-function.ts  # Supabase Edge Function invocation helper
│   │   ├── alert.ts      # Cross-platform alert helper
│   │   ├── time.ts       # Bangkok timezone formatting / pickup-slot helpers
│   │   └── menu-categories.ts  # Drinks/Beverages category reconciliation + top-category picker (cold-start User Vector)
│   └── types/
│       └── database.types.ts  # Generated Supabase types
├── supabase/
│   ├── migrations/       # SQL migration files (timestamp-prefixed)
│   └── functions/        # Edge fns: admin-create-vendor, bootstrap-admin,
│                         #   recommend-for-you, recommend-similar (ranking pipeline)
├── ml/                    # recommend.py (TF-IDF + cosine demo), data/*.csv fixtures
├── eas.json               # EAS build/submit profiles (iOS-first)
├── global.css            # Tailwind directives (imported in app/_layout)
└── tailwind.config.js
```

## Architecture & Domain Concepts

### Recommendation Features

1. **Similar Foods** — content-based (TF-IDF + cosine similarity on ingredients/cuisine/tags)
2. **Because You Ordered...** — collaborative filtering on order history & similar users
3. **Trending Meals Today** — popularity from recent order volume
4. **No Queue Right Now** — vendors ranked by low `estimated_wait_min` / `queue_count`
5. **Time-Based** — breakfast/lunch/dinner context
6. **Latest Release** — newest menu items (last 7 days, `release_date DESC`, top 10, daily reset)
7. **Promoted Foods** — sponsored items from partner vendors

Default to TF-IDF + cosine for content-based and collaborative filtering for "because you ordered" — don't introduce new ML approaches unless asked.

### Dietary Filtering: hard filter vs. warn

- **Halal / Vegetarian / Jay** — hard filters. Items the student cannot eat are excluded everywhere (home feed, search, `recommend-for-you`, `recommend-similar`).
- **Allergies** — NOT a filter. Saved allergies never hide items. The gate is a `showConfirm` ("Add Anyway") popup on Add to Cart in `item/[id].tsx` — the single funnel every add-to-cart path goes through — fired when the dish's `allergens` intersect the user's saved `allergies`. Search results show a red '⚠️ Allergen' badge; the item page underlines the matched allergen. Changed 2026-09-02 (`4d2370e`, reverting the hide-from-search approach in `a1e9df9`).

### ML Pipeline (User Vector approach)

Build a **User Vector** (taste profile) from behavior — order history, ratings, view/click, trending, time context — and **Food Vectors** via TF-IDF on ingredients/cuisine/dietary tags; rank by **cosine similarity**, then filter by dietary rules, allergies, budget, wait time, ratings → Top-N. Reference impl: `ml/recommend.py`.

### User Roles

- **Student** — browse, order, pre-order with pickup time, pay via Campus Wallet, track, rate. Google-only auth ([[project_vendor_google_only_auth]]).
- **Vendor** — manage menu, accept/reject/complete orders, view earnings. **Email/password auth** at `/vendor-login` (`signInWithPassword`, screen mirrors `admin-login.tsx`). Store accounts are created by an admin, not self-serve: `(admin)/new-vendor.tsx` form (store email, password, business name, cuisine tags) → `admin-create-vendor` edge function → `auth.admin.createUser({ email_confirm: true })` → `provision_vendor()` RPC creates the `vendors` row (`owner_user_id` set, `is_on_campus`/address default) and flips `users.role` to `vendor`. Location is set afterward from the vendor profile screen. The admin hands the credentials to the vendor; "Forgot Password?" on `/vendor-login` is a contact-admin stub. Changed 2026-08-30 (was Google-only + self-serve `vendor_applications`) — see [[project_vendor_google_only_auth]] and `docs/superpowers/specs/2026-08-30-vendor-email-password-auth-design.md`.
- **Admin** — manage users, monitor transactions & reports; creates vendor store accounts at `/admin-login` → `(admin)/new-vendor`; monitors every vendor stall and can force one open/closed at `(admin)/vendors` (writes `vendors.is_open` directly, bypassing the owner). Email/password (`signInWithPassword`), bootstrapped once via the `bootstrap-admin` edge function.

### Payment Flow

Escrow: student payment held → on completion, transferred to vendor wallet (refunded if rejected/cancelled). Implement via Supabase RPC.

### Localization

- Menu item Thai names/descriptions (`name_th`/`description_th`) and vendor `bio_th` are vendor-entered data, not app UI strings — DB columns, not `lib/i18n/`. Fall back to the base (English) text when the Thai column is empty. Handled by `localizedText()` in `src/lib/localize.ts`.
- Notification rows snapshot `event` + params (vendor, queue number, amount) at insert time in the DB triggers (`notify_order_status_change()`, `notify_vendor_new_order()`) instead of pre-rendered English text. `notificationText()` in `localize.ts` renders from that snapshot using whatever locale is active *now* — not whichever locale was active when the trigger fired.
- Student-facing lists that poll live state (orders, wallet) refetch on tab focus (`useFocusEffect`), not just on mount — apply the same pattern to any new tab/screen showing data that can change server-side while the tab is backgrounded.

## Data Model

Keep schema consistent with this ERD for all SQL/migrations/types. Field names are authoritative.

- **users** — id (uuid, references auth.users), name, email, university_id, role (student|vendor|admin), department, language, wallet_balance, avatar_url, notifications_enabled, created_at
- **user_preferences** — user_id, is_halal, is_vegetarian, is_jay, spice_level, budget_max, allergies (text[]), liked_cuisines (text[]), favorite_categories (text[])
- **vendors** — id, name, stall_number, is_on_campus, address, is_halal_certified, open_time, close_time, is_open, bio, bio_th, cuisine_tags (text[]), estimated_wait_min, cover_image_url, current_queue_count, owner_user_id, created_at
- **menu_items** — id, vendor_id, name, description, price, category, spice_level, is_available, is_halal, is_vegetarian, is_jay, allergens (text[]), tags (text[]), ingredients (text[]), preparation_time_min, image_url, is_featured, available_time_segment (breakfast|lunch|dinner|all), release_date, updated_at
- **orders** — id, user_id, vendor_id, queue_number, status (pending|accepted|rejected|ready|completed|cancelled), subtotal, packaging_fee, total_amount, payment_method, pickup_start, pickup_end, estimated_prep_minutes, time_segment, vendor_handed_off_at, student_picked_up_at, created_at
- **order_items** — id, order_id, menu_item_id, quantity, unit_price, special_instructions
- **payments** — id, order_id, amount, method, status, promptpay_ref, qr_code_url, paid_at
- **wallet_transactions** — id, user_id, type (topup|payment|refund|transfer), amount, reference, description, created_at
- **ratings** — id, user_id, menu_item_id, order_id, score, comment, created_at
- **notifications** — id, user_id, order_id, type, icon, title, body, read, event, vendor_name, queue_number, total_amount, created_at (see Localization — text renders from the `event` + params snapshot, not stored English)
- **ml_interactions** — id, user_id, menu_item_id, action (view|click|order|skip), view_duration_sec, was_recommended, created_at
- **recommendation_log** — id, user_id, row_type, recommendation_type, item_ids (uuid[]), match_score, served_at
- **promotions** — id, vendor_id, title, description, discount_pct, target_category, valid_from, valid_until, is_active

## Coding Conventions

- `tsconfig.json` has `strict: true` — write proper types, don't silence errors with `any`
- NativeWind v4 utility classes for all RN styling
- Supabase RPC/database functions for server-side business logic (escrow, queue numbers, wallet mutations)
- ML scripts (in `/ml`): keep pandas/scikit-learn code readable and commented — capstone demo, not production scale
- Prefer small incremental working pieces over large speculative scaffolding
- PKCE/Google login on native needs a `crypto.subtle.digest` polyfill — RN has no native WebCrypto. Don't remove it while touching auth.

## User Journey

Discover → Onboarding (Google login, preferences/allergies/budget) → Explore (AI recs, filters) → Order (details, customize, pickup time) → Payment (Campus Wallet) → Track (real-time queue) → Pickup → Review

## Data Strategy

All surfaces read real Supabase — the DB carries real seeded KMUTT data (16 stalls, ~500 menu items). Mock fixtures (`src/lib/mock-data.ts`) were removed 2026-08-31; screens now show their own empty states when a query returns nothing, not fake data.
- **Student side** — Home (`/(tabs)/index.tsx`) and search query Supabase directly. Empty-state copy: `home.noStallsOpen`, `home.noFeaturedItems`, `search.noResults`. Client state: `cart-store.ts` (single-vendor-per-cart rule), local component state for wallet.
- **Vendor & admin side** — `vendor-store.ts` (orders/menu/profile, with Realtime) and the admin new-vendor / store-monitoring screens hit live tables.
- Remaining mock-to-real TODOs are `ponytail:` comments — currently menu-item image upload in `(vendor)/menu/new.tsx` (needs Supabase Storage `menu-item-images` bucket) and the single-vendor-per-cart note in `cart-store.ts`. Grep `ponytail:` before trusting this list — it drifts.
