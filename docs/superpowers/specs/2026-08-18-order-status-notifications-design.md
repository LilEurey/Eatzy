# Order-status notifications (student side) — design

## Problem

`src/app/notifications.tsx` renders `MOCK_NOTIFICATIONS`, a static fixture in
`src/lib/mock-data.ts`. It is never written to, and no code fires a
notification when an order's status changes. `track/[id].tsx` already
receives the real status change live via Supabase Realtime, but only updates
local screen state — nothing persists it, so the notifications list and home
bell never reflect it. This is a pure gap (no prior implementation), not a
regression.

## Scope

In-app notification list only. No OS push, no `expo-notifications`
dependency. Promo-type notifications (`n002` in the mock fixture) stay mock —
only order-status notifications become real.

## Architecture

A Postgres trigger on `orders` writes a row to a new `notifications` table
whenever `status` changes to one of `accepted`, `ready`, `rejected`,
`completed`. This is preferred over inserting from client code because order
status is currently written from multiple places with a direct
`.update({status})` call (`src/lib/vendor-store.ts:196,203,212`), not a single
RPC — a trigger catches every write path, including future ones, without
needing each call site to remember to also insert a notification.

The student-side notifications screen queries the table (scoped to the
current user) instead of the mock fixture, and subscribes to Realtime INSERTs
so a notification appears live while the screen is open — mirroring the
pattern already used in `track/[id].tsx`. The home-screen bell icon shows an
unread-count dot, refreshed via `useFocusEffect` (same pattern as
`src/app/(tabs)/profile.tsx`) each time the home tab gains focus.

## Data model

New table `notifications`:

| column | type | notes |
|---|---|---|
| id | uuid, pk, default gen_random_uuid() | |
| user_id | uuid, references users(id) | recipient |
| order_id | uuid, references orders(id) | |
| type | text | `'order'` only, for now |
| icon | text | emoji, mirrors mock shape |
| title | text | |
| body | text | |
| read | boolean, default false | |
| created_at | timestamptz, default now() | |

RLS: authenticated user may `select`/`update` (read flag only) rows where
`user_id = auth.uid()`. No `insert` policy for authenticated clients — the
only insert path is the trigger function, which runs `SECURITY DEFINER` and
bypasses RLS. This means neither student nor vendor client code can forge a
notification.

## Backend: trigger

`notify_order_status_change()` — `AFTER UPDATE ON orders`, fires when
`NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('accepted',
'ready', 'rejected', 'completed')`. Looks up the vendor name via
`NEW.vendor_id`, builds title/body/icon per status, inserts one row for
`NEW.user_id`.

Copy per status (icon / title / body):

- `accepted` — 👨‍🍳 / "Order accepted!" / "{vendor} is preparing your order · Queue #{queue_number}"
- `ready` — 🎉 / "Order ready for pickup!" / "{vendor} · Queue #{queue_number}"
- `rejected` — 😕 / "Order rejected" / "{vendor} couldn't accept your order — refund processing"
- `completed` — ✅ / "Order picked up" / "Enjoy your meal from {vendor}!"

(`ready` copy matches the existing mock fixture's `n001` entry.)

## Frontend

**`src/app/notifications.tsx`**
- Replace `MOCK_NOTIFICATIONS` with a Supabase query: `notifications` rows
  where `user_id = <current user>`, ordered by `created_at desc`.
- Subscribe to Realtime `INSERT` events on `notifications` filtered by
  `user_id`, appending new rows to the top of the list live (same
  subscribe/cleanup pattern as `track/[id].tsx`).
- After the initial fetch, mark all currently-unread rows as read
  (`read = true`) — auto-mark-on-open, no per-row tap needed.

**`src/app/(tabs)/index.tsx`**
- On focus (`useFocusEffect`), run a one-shot count query:
  `notifications` where `user_id = <current user> AND read = false`.
- If count > 0, render a small dot on `BellIcon` (`index.tsx:151-153`).
- No persistent Realtime subscription for the badge — it refreshes on next
  focus rather than ticking live. Accepted trade-off for MVP scope.

## Testing

No automated test framework covers this app surface currently (TS types +
ESLint only, per project conventions). Verify manually:
1. Place an order as a student, accept/mark-ready/reject/complete it as the
   vendor (or via admin/direct SQL for statuses vendor UI doesn't expose).
2. Confirm a row appears in `notifications` for the right user with the right
   copy.
3. With the student's notifications screen open, confirm the row appears
   live via Realtime.
4. Reopen the home tab, confirm the bell badge dot appears/disappears
   correctly around the unread state.
