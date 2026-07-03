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
```

## Project Structure

```
Eatzy/
├── src/
│   ├── app/              # Expo Router pages (file-based routing)
│   ├── components/       # Reusable RN components
│   ├── lib/
│   │   └── supabase.ts   # Supabase client singleton
│   └── types/
│       └── database.types.ts  # Generated Supabase types
├── supabase/
│   └── migrations/       # SQL migration files (timestamp-prefixed)
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

- **Student** — browse, order, pre-order with pickup time, pay via Campus Wallet, track, rate
- **Vendor** — manage menu, accept/reject/complete orders, view earnings
- **Admin** — manage users, monitor transactions & reports

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

## Coding Conventions

- Plain TS is fine; don't enforce strict mode unless asked
- NativeWind v4 utility classes for all RN styling
- Supabase RPC/database functions for server-side business logic (escrow, queue numbers, wallet mutations)
- ML scripts (in `/ml`): keep pandas/scikit-learn code readable and commented — capstone demo, not production scale
- Prefer small incremental working pieces over large speculative scaffolding

## User Journey

Discover → Onboarding (Google login, preferences/allergies/budget) → Explore (AI recs, filters) → Order (details, customize, pickup time) → Payment (Campus Wallet) → Track (real-time queue) → Pickup → Review

## Git Workflow

Commit at these natural checkpoints — not after every file edit:
- After each **Phase** in the build plan completes and compiles cleanly
- After fixing a **bug or error** that was blocking progress
- After applying **database migrations**

Use conventional commits:
```
feat(phase-3): home screen with vendor list and recommendations
fix(auth): remove unused Linking import causing TS error
chore(db): apply escrow RPC migration
```

Always run `npx tsc --noEmit` before committing. Never commit with TypeScript errors.

## Build Status

- [x] Phase 1 — App shell (auth gate, tab navigator, Supabase + DB migrations)
- [x] Phase 2 — Login screen + Onboarding preferences screen
- [x] Phase 3 — Home screen (greeting, search, queue banner, recommendations, store list)
- [x] Phase 4 — Store detail (`/store/[id].tsx`) + Food item detail (`/item/[id].tsx`)
- [x] Phase 5 — Cart state (`src/lib/cart-store.ts`) + Cart screen + Checkout with time slot picker
- [x] Phase 6 — Order tracking (`/track/[id].tsx`) + Rating screen (`/rate/[id].tsx`)
- [~] Phase 7 — Orders tab (done), Wallet tab (balance + local top-up, done), Profile tab (dev nav + logout done; avatar/settings still TODO)

### Data strategy (current)

The DB is empty during development, so screens run on **mock fixtures** in `src/lib/mock-data.ts`.
Home (`/(tabs)/index.tsx`) queries Supabase and falls back to mock when the DB returns nothing; other
screens read mock directly. Client-side state uses `src/lib/cart-store.ts` (cart) and local component
state (wallet). Points wired to mock that need a real backend when the DB is live — search for `ponytail:`
comments — are: track-screen status progression (→ Supabase Realtime on `orders.status`), rating submit
(→ `ratings` insert), and wallet top-up (→ `topup_wallet` RPC).
