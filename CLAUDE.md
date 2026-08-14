# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Expo SDK 56** is in use — always check versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing Expo/RN code.

## Project Overview

Eatzy is a campus food ordering & recommendation app ("Fuel your day the easy way") for KMUTT's student food ecosystem — targeting international students dealing with language barriers, missing ingredient info, and dietary filtering in Thai canteens.

**Core features:** smart ML recommendations, pre-order by time slot, dietary/allergy filtering, vendor management, escrow-based Campus Wallet payments.

## Tech Stack

- **Frontend:** React Native + Expo (SDK 56), Expo Router, NativeWind v4 (Tailwind CSS)
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime, RPC/database functions)
- **ML:** Python, pandas, scikit-learn (TF-IDF + cosine similarity for content-based; collaborative filtering for "because you ordered")
- **Infra:** GitHub, Expo EAS

## Commands

```bash
npx expo start          # Start dev server (scan QR with Expo Go)
npx expo start --ios    # Open in iOS Simulator
npx expo start --android
npm run lint            # ESLint
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
│   │   ├── (vendor)/     # Vendor dashboard — orders, menu, analytics, profile (real Supabase, not mock)
│   │   ├── (admin)/      # Admin portal — vendor application review (email/password auth, not Google)
│   │   ├── (auth)/       # Login/onboarding stack
│   │   ├── admin-login.tsx, become-vendor.tsx, vendor-apply.tsx  # Public entry points outside the tab groups
│   │   └── store/, item/, track/, rate/  # Detail screens
│   ├── components/       # Reusable RN components (Tap, PillDropdown)
│   ├── hooks/            # useGoogleSignIn, etc.
│   ├── constants/        # theme.ts (Brand colors/tokens)
│   ├── lib/
│   │   ├── supabase.ts   # Supabase client singleton
│   │   ├── i18n/         # Translation strings, useI18n hook
│   │   ├── cart-store.ts, vendor-store.ts  # useSyncExternalStore-based client state
│   │   ├── vendor-intent.ts  # Post-OAuth redirect flag for "Become a Vendor" flow
│   │   └── edge-function.ts  # Supabase Edge Function invocation helper
│   └── types/
│       └── database.types.ts  # Generated Supabase types
├── supabase/
│   └── migrations/       # SQL migration files (timestamp-prefixed)
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

### ML Pipeline (User Vector approach)

1. Collect: order history, ratings, view/click behavior, trending stats, time context
2. Build **User Vector** (taste profile) from behavior
3. Build **Food Vectors** via TF-IDF on ingredients/cuisine/dietary tags
4. Compute **cosine similarity** between User Vector and Food Vectors
5. Rank & filter by: dietary rules, allergies, budget, wait time, ratings → Top-N results

### User Roles

- **Student** — browse, order, pre-order with pickup time, pay via Campus Wallet, track, rate. Google-only auth ([[project_vendor_google_only_auth]]).
- **Vendor** — manage menu, accept/reject/complete orders, view earnings. Google-only auth, same post-incident policy as student. Onboarding: public `/become-vendor` pitch screen → `/vendor-apply` form → row in `vendor_applications` → admin approval flips `users.role` to `vendor`. `vendor-intent.ts` carries the "wants to become a vendor" flag through the OAuth redirect.
- **Admin** — manage users, monitor transactions & reports; reviews/approves-or-rejects pending vendor applications at `/admin-login` → `(admin)/applications`. Deliberately **not** Google-only — `signInWithPassword`, separate from the student/vendor policy.

### Payment Flow

Escrow: student payment held → on completion, transferred to vendor wallet (refunded if rejected/cancelled). Implement via Supabase RPC.

## Data Model

Keep schema consistent with this ERD for all SQL/migrations/types. Field names are authoritative.

- **users** — id (uuid, references auth.users), name, email, university_id, role (student|vendor|admin), department, language, wallet_balance, created_at
- **user_preferences** — user_id, is_halal, is_vegetarian, is_jay, spice_level, budget_max, allergies (text[]), liked_cuisines (text[]), favorite_categories (text[])
- **vendors** — id, name, stall_number, is_halal_certified, open_time, close_time, is_open, bio, cuisine_tags (text[]), estimated_wait_min, cover_image_url, current_queue_count, created_at
- **menu_items** — id, vendor_id, name, description, price, category, spice_level, is_available, is_halal, is_vegetarian, is_jay, allergens (text[]), tags (text[]), ingredients (text[]), calories, preparation_time_min, image_url, is_featured, available_time_segment (breakfast|lunch|dinner|all), release_date, updated_at
- **orders** — id, user_id, vendor_id, queue_number, status (pending|accepted|rejected|ready|completed|cancelled), subtotal, packaging_fee, total_amount, payment_method, pickup_start, pickup_end, estimated_prep_minutes, time_segment, created_at
- **order_items** — id, order_id, menu_item_id, quantity, unit_price, special_instructions
- **payments** — id, order_id, amount, method, status, promptpay_ref, qr_code_url, paid_at
- **wallet_transactions** — id, user_id, type (topup|payment|refund|transfer), amount, reference, description, created_at
- **ratings** — id, user_id, menu_item_id, order_id, score, comment, created_at
- **ml_interactions** — id, user_id, menu_item_id, action (view|click|order|skip), view_duration_sec, was_recommended, created_at
- **recommendation_log** — id, user_id, row_type, recommendation_type, item_ids (uuid[]), match_score, served_at
- **promotions** — id, vendor_id, title, description, discount_pct, target_category, valid_from, valid_until, is_active
- **vendor_applications** — id, vendor_id, full_name, email, phone, bio, status (pending|approved|rejected), submitted_at

## Coding Conventions

- Plain TS is fine; don't enforce strict mode unless asked
- NativeWind v4 utility classes for all RN styling
- Supabase RPC/database functions for server-side business logic (escrow, queue numbers, wallet mutations)
- ML scripts (in `/ml`): keep pandas/scikit-learn code readable and commented — capstone demo, not production scale
- Prefer small incremental working pieces over large speculative scaffolding

## User Journey

Discover → Onboarding (Google login, preferences/allergies/budget) → Explore (AI recs, filters) → Order (details, customize, pickup time) → Payment (Campus Wallet) → Track (real-time queue) → Pickup → Review

## Git Workflow

Use the `git-workflow` skill for git mechanics (staging, atomicity, commit messages, branching, safety rules, PRs). Project-specific overrides on top of the skill:

- Commit after every discrete change, without waiting to be asked — a standing exception to the skill's default judgment-based cadence. The goal is a safety net: if an AI-made change turns out wrong, there should always be a recent commit to roll back to. Commit at minimum after each individual file/feature edit that leaves the project compiling cleanly, after each **Phase** in the build plan completes, after fixing a **bug or error** that was blocking progress, and after applying **database migrations**.
- Tag phase-based feature commits accordingly: `feat(phase-3): home screen with vendor list and recommendations`.
- Always run `npx tsc --noEmit` before committing. Never commit with TypeScript errors.

## Build Status

- [x] Phase 1 — App shell (auth gate, tab navigator, Supabase + DB migrations)
- [x] Phase 2 — Login screen + Onboarding preferences screen
- [x] Phase 3 — Home screen (greeting, search, queue banner, recommendations, store list)
- [x] Phase 4 — Store detail (`/store/[id].tsx`) + Food item detail (`/item/[id].tsx`)
- [x] Phase 5 — Cart state (`src/lib/cart-store.ts`) + Cart screen + Checkout with time slot picker
- [x] Phase 6 — Order tracking (`/track/[id].tsx`) + Rating screen (`/rate/[id].tsx`)
- [x] Phase 7 — Orders tab, Wallet tab (balance + local top-up), Profile tab (initials avatar, settings list, dev nav, logout)
- [x] ML pipeline — `ml/recommend.py`: TF-IDF food vectors, user vector, cosine ranking with allergy/budget/dietary filters, co-occurrence "because you ordered"; runs on CSV fixtures in `ml/data/` (swap loader to Supabase when live). `cd ml && ./.venv/bin/python recommend.py` runs demo + self-checks.
- [x] Vendor onboarding — `/become-vendor` pitch → `/vendor-apply` form → `vendor_applications` row → admin approval. Google-only auth carried through OAuth via `vendor-intent.ts`.
- [x] Vendor dashboard — `(vendor)/` group: orders, menu (with image upload TODO), analytics, profile. Backed by real Supabase queries + Realtime via `vendor-store.ts`, not mock fixtures.
- [x] Admin portal — `/admin-login` (email/password) + `(admin)/applications` to approve/reject pending vendor applications via an edge function (`edge-function.ts`).
- [x] EAS build setup — `eas.json` with development/preview/production profiles, iOS-first ([[project_ios_first_priority]]).

### Data strategy (current)

Split by surface, not uniform:
- **Student side** — DB is sparsely seeded during development, so screens lean on **mock fixtures** in `src/lib/mock-data.ts`. Home (`/(tabs)/index.tsx`) queries Supabase and falls back to mock when the DB returns nothing; other student screens read mock directly. Client-side state: `src/lib/cart-store.ts` (cart, single-vendor-per-cart rule) and local component state (wallet).
- **Vendor & admin side** — already real Supabase, not mock: `vendor-store.ts` (orders/menu/profile, with Realtime) and the admin applications flow both hit live tables.
- Remaining mock-to-real TODOs are marked with `ponytail:` comments — currently: menu-item image upload in `(vendor)/menu/new.tsx` (needs Supabase Storage `menu-item-images` bucket) and the single-active-vendor-per-cart note in `cart-store.ts`. Grep `ponytail:` before trusting this list — it drifts as TODOs get resolved.
