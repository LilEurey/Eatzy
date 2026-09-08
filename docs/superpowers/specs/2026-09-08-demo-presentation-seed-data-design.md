# Demo presentation seed data — design

**Date:** 2026-09-08
**Goal:** Populate the *behavioural / transactional* layer of the hosted Supabase
project so a live demo can show every feature end to end — food recommendations,
order flow, wallet, tracking, ratings, notifications, and the vendor dashboard —
without touching the real catalog.

## Scope

**In:** synthetic students, `user_preferences`, `orders`, `order_items`,
`payments`, `wallet_transactions`, `ratings`, `ml_interactions`,
`recommendation_log`, `notifications`, and the wallet balances that follow from
the seeded money movement.

**Out (explicitly not touched):** `vendors`, `menu_items`, `promotions`, and any
other catalog data. Those already hold the real KMUTT dataset (16 stalls, 500
items) and stay exactly as-is.

## Deliverable

One idempotent migration: `supabase/migrations/20260908010000_seed_demo_presentation_data.sql`.

- All seeded rows use fixed UUIDs in the `ea…` range.
- Per-order idempotency: the helper `pg_temp.mk_order()` early-returns if the
  order id already exists, so a re-`push` is a no-op.
- Blocks for `ml_interactions` / `recommendation_log` / `notifications` / `ratings`
  are guarded by `if not exists (…)` sentinels.
- The two `orders` notification triggers (`order_notify_vendor`,
  `order_status_notify`) are disabled for the bulk insert and re-enabled after;
  a curated set of notifications is then inserted by hand. Migration runs in a
  transaction, so a mid-way failure rolls the `DISABLE` back too.
- Wallet writes set `app.bypass_wallet_guard` (required by
  `prevent_privileged_self_update`).

## Data

### Synthetic students (6)
`demo.stu1..6@eatzy.app`, password `eatzy1234`, fixed uuids `ea510000-…-00000000000N`.
Rows created via `auth.users` + `auth.identities` inserts (same pattern as
`20260902000000_seed_kmutt_vendor_accounts`); `handle_new_user` mirrors them into
`public.users`. Each gets a `user_preferences` row with varied dietary rules
(one halal, one vegetarian, one jay), spice, budget, allergies.

### Order history (≈55 completed)
Two loops through the 6 students:
- Loop A — 30 orders across 7 vendors (Dino Papa, Nui Noodles, Pa Kaew, Fahsai,
  P' Pom, Som Tum, Loong Noom), overlapping item choices, `created_at` spread
  over ~18 days.
- Loop B — 20 Dino Papa-only orders for dashboard/analytics depth.

Overlap in item choices gives `get_because_you_ordered` real co-occurrence
peers; orders inside the last 7 days feed `get_trending_items`. Each completed
order writes `order_items`, a completed `payments` row, student `payment` and
vendor `transfer` `wallet_transactions`, and sets both handoff timestamps.

### Live vendor KDS (Dino Papa)
5 fixed orders so every column is populated: 2 `pending`, 2 `accepted`, 1 `ready`
(from synthetic students), plus the demo student's active order.

### Demo student (the presenter's real Google account)
Resolved by `auth.users.email`. **A constant `v_demo_email` at the top of the
migration holds the target address — it defaults to `demo.student1@eatzy.app`
(exists, password `eatzy1234`) and is swapped to the real Google address once the
presenter has signed into the hosted app once.** If the address is not found the
demo-student block is skipped with a `raise notice`; everything else still applies.

- `user_preferences`: spice 3, budget ฿120, `allergies = {peanuts}` (drives the
  "Add Anyway" warn dialog and the search allergen badge), liked cuisines +
  favourite categories aligned to the real catalog vocabulary so
  `recommend-for-you` returns hits.
- Wallet: two `topup` rows; balance recomputed from the transaction ledger.
- 8 completed orders over 14 days across 5 vendors (items overlapping the
  synthetic students' picks). One left **unrated** → Rate screen. One `rejected`
  order for a rejected-state notification.
- 1 active `accepted` order at Dino Papa → Track screen + shows on the KDS.
- 5 `ratings` (scores 3–5, two with comments).
- ~27 `ml_interactions` (view/click/order/skip, some `was_recommended`).
- 6 `recommendation_log` rows, one per home-screen row type.
- 5 `notifications` (accepted / ready / completed / rejected), one unread → bell
  badge.

### Vendor manager (`manager@dinopapa.eatzy.app`)
3 `vendor_new_order` notifications (unread) → dashboard bell. `wallet_balance`
for every touched vendor owner recomputed from their `transfer` ledger.

## Rollback

Everything is namespaced. To remove: delete `notifications`, `ratings`,
`ml_interactions`, `recommendation_log`, `wallet_transactions`, `payments`,
`order_items`, `orders` rows with `id` / `reference` in the `ea…` range and the
`ea510000-…` auth users; catalog is untouched.
