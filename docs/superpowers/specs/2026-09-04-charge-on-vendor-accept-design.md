# Charge on Vendor Accept — Design

**Date:** 2026-09-04
**Status:** Approved, pending implementation

## Problem

Today `cart.tsx` deducts the student's wallet balance the moment an order is
placed (`place_order_escrow`, called right after the `orders` row is
inserted). The order then sits in `pending` status waiting for the vendor to
accept or reject it. If the vendor rejects, `refund_escrow` gives the money
back.

This means a student's money is held hostage from the instant they tap
"Place Order" — before any vendor has even seen it. There's also no way for
a student to cancel a `pending` order themselves; the `cancelled` status
exists in the schema and an RLS policy already permits the transition, but
nothing in the UI calls it.

## Goal

Move the wallet deduction from **order placement** to **vendor accept**.
Money should only leave the student's wallet once a vendor has committed to
making the order. Before that point, the order is free to cancel.

## Behavior change

### Before
1. Student places order → `orders` row inserted (`status: 'pending'`) →
   `place_order_escrow` deducts wallet immediately, inserts a `payments`
   row (`status: 'pending'`).
2. Vendor accepts → `orders.status = 'accepted'`. No money movement.
3. Vendor rejects → `orders.status = 'rejected'` → `refund_escrow` refunds
   the student.
4. Both sides confirm handoff → `finalize_order_handoff` pays the vendor
   out of the held escrow.

### After
1. Student places order → `orders` row inserted (`status: 'pending'`). No
   wallet deduction, no `payments` row yet.
2. Student may cancel while still `pending` → `orders.status = 'cancelled'`.
   Nothing to refund — nothing was ever charged.
3. Vendor accepts → `accept_order_and_charge(p_order_id)` RPC:
   - Verifies the caller owns the vendor stall the order belongs to.
   - Verifies the order is still `pending`.
   - Re-validates add-on group min/max rules (same check
     `place_order_escrow` used to run, moved here since this is now the
     charge point).
   - Attempts to deduct `orders.total_amount` from the student's wallet.
     - **Success:** inserts the `payments` row (`status: 'pending'`),
       inserts a `wallet_transactions` debit row, sets
       `orders.status = 'accepted'`. Returns `'accepted'`.
     - **Insufficient balance:** sets `orders.status = 'rejected'`
       directly. No `payments` row, no debit, no exception raised — this
       result commits normally so the order actually leaves the incoming
       queue. Returns `'insufficient_balance'`.
4. Vendor rejects (still only available pre-accept, i.e. on a `pending`
   order) → plain `orders.status = 'rejected'` update. Nothing was charged,
   so there's nothing to refund; the `refund_escrow` call is removed from
   this path.
5. Both sides confirm handoff → unchanged (`finalize_order_handoff` already
   only acts on a `payments` row with `status = 'pending'`, which now only
   exists post-accept).

## Database changes

New migration: `supabase/migrations/20260904010000_charge_on_vendor_accept.sql`

- **Drop** `place_order_escrow(p_user_id, p_order_id, p_amount)`. It's no
  longer called from any client path once this ships. Dropped outright
  rather than left dormant — same precedent as
  `20260828000000_drop_release_escrow_to_vendor.sql`: an unused
  `SECURITY DEFINER` wallet-mutating RPC left reachable over PostgREST is a
  liability, not a convenience.

- **Create** `accept_order_and_charge(p_order_id uuid) returns text`,
  `security definer`, `set search_path = ''`, ownership-checked against
  `vendors.owner_user_id`, using the same `app.bypass_wallet_guard` escape
  hatch the other escrow RPCs use before touching `wallet_balance`. Sketch:

  ```sql
  create or replace function public.accept_order_and_charge(p_order_id uuid)
  returns text
  language plpgsql security definer
  set search_path = ''
  as $$
  declare
    v_vendor_id  uuid;
    v_owner_id   uuid;
    v_user_id    uuid;
    v_amount     numeric;
    v_status     text;
  begin
    select o.vendor_id, o.user_id, o.total_amount, o.status
      into v_vendor_id, v_user_id, v_amount, v_status
      from public.orders o
     where o.id = p_order_id
     for update;

    if not found then
      raise exception 'order_not_found';
    end if;

    select owner_user_id into v_owner_id from public.vendors where id = v_vendor_id;

    if auth.uid() is distinct from v_owner_id then
      raise exception 'not_authorized';
    end if;

    if v_status <> 'pending' then
      raise exception 'order_not_pending';
    end if;

    if exists (
      select 1
        from public.order_items oi
        join public.menu_item_addon_groups g on g.menu_item_id = oi.menu_item_id
        left join public.order_item_addons oia
          on oia.order_item_id = oi.id
         and oia.addon_id in (select id from public.menu_item_addons where group_id = g.id)
       where oi.order_id = p_order_id
       group by oi.id, g.id, g.min_select, g.max_select
      having count(oia.id) < g.min_select
          or (g.max_select is not null and count(oia.id) > g.max_select)
    ) then
      raise exception 'addon_rule_violation';
    end if;

    perform set_config('app.bypass_wallet_guard', 'on', true);

    update public.users
       set wallet_balance = wallet_balance - v_amount
     where id = v_user_id
       and wallet_balance >= v_amount;

    if not found then
      update public.orders set status = 'rejected' where id = p_order_id;
      return 'insufficient_balance';
    end if;

    insert into public.payments (order_id, amount, method, status)
    values (p_order_id, v_amount, 'wallet', 'pending');

    insert into public.wallet_transactions (user_id, type, amount, reference, description)
    values (v_user_id, 'payment', -v_amount, p_order_id::text, 'Order payment held in escrow');

    update public.orders set status = 'accepted' where id = p_order_id;

    return 'accepted';
  end;
  $$;

  grant execute on function public.accept_order_and_charge(uuid) to authenticated;
  ```

- `refund_escrow` is left as-is — still correct for refunding a `payments`
  row with `status = 'pending'` — but no client path calls it after this
  change ships. It stays dormant for potential future
  accept-then-cancel work, not wired to any UI action today.

- No RLS change needed for cancel: `orders: student cancels own pending`
  (from `20260806000003_fix_order_status_transitions.sql`) already allows
  `pending → cancelled` for the order's own `user_id`. It's just never been
  called from the client.

## Client changes

- **`src/app/cart.tsx`** — remove the `place_order_escrow` RPC call from
  `submitOrder()`. Order insert stays as-is; no wallet touch, no
  `insufficient_wallet_balance` branch in the catch block (that failure
  mode can no longer happen at this step).

- **`src/lib/vendor-store.ts`**
  - `acceptOrder(id)` — call `accept_order_and_charge` instead of the
    direct `.update({status:'accepted'})`. Branch on the returned text:
    `'accepted'` → normal (silent) success, same as today.
    `'insufficient_balance'` → `showAlert` telling the vendor the order was
    auto-rejected because the customer's balance changed; the order will
    already have left the `pending`/incoming column on the next refetch
    since its status is now `rejected`.
  - `rejectOrder(id)` — drop the `refund_escrow` call. Just the status
    update, since nothing was ever charged on this path.

- **`src/app/track/[id].tsx`** — add a "Cancel Order" action, shown only
  when `status === 'pending'`. Calls a new `cancelOrder(id)` (colocated in
  this file, or a small shared helper if track and orders both end up
  needing it — start colocated, only extract if a second caller shows up)
  that does:
  ```ts
  await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id).eq('status', 'pending');
  ```
  Confirm via the existing cross-platform `alert.ts` destructive-confirm
  pattern (mirrors the `showConfirm` used for the allergen "Add Anyway"
  gate) before firing — this is a one-way action from the student's
  perspective. Not added to `orders.tsx`'s list cards; `track/[id].tsx` is
  already the single funnel for an in-progress order's actions (mirrors
  how the allergen gate lives in one funnel per CLAUDE.md conventions).

- **`src/types/database.types.ts`** — remove the `place_order_escrow`
  entry under `Functions`, add `accept_order_and_charge: { Args:
  { p_order_id: string }; Returns: string }`. (Would normally come from
  `supabase gen types`, but several migrations are already pending a
  hosted `db push` on this project, so this gets hand-edited to match the
  new migration, same as the rest of that queue.)

## Error handling / edge cases

- **Balance drops between placement and accept** (student places two
  orders, or balance changes some other way before a vendor gets to
  either): handled by the `insufficient_balance` branch above — order
  auto-rejects, vendor is told why, no manual retry path needed.
- **Vendor rejects a pending order**: unchanged UX, just no longer touches
  money.
- **Student cancels a pending order**: no money to unwind, single status
  flip.
- **Order already accepted/rejected/etc. when accept is attempted twice**
  (e.g. double-tap): `accept_order_and_charge` raises `order_not_pending`
  and the second call fails loudly rather than double-charging — same
  guard shape as the existing handoff RPCs.
- **Addon rule violation surviving to accept time**: shouldn't normally
  happen since order_items are fixed at insert, but the check is preserved
  defensively exactly where `place_order_escrow` had it.

## Out of scope

- Cancelling or refunding an **already-accepted** order (student wants to
  cancel after the vendor started prepping). Not requested, not built. If
  this comes up later, `refund_escrow` is still the right tool — it just
  needs a client caller and a status-transition/RLS story for
  `accepted → cancelled`.
- Any soft balance warning at checkout time (cart.tsx). The design
  discussion flagged this as a possible follow-up but it wasn't requested;
  today the student simply finds out at accept time if their order gets
  auto-rejected for insufficient balance.
- A cancel notification to the vendor. The existing notification triggers
  (`notify_vendor_new_order`, `notify_order_status_change`) aren't
  extended with a cancel case here.

## Testing

- `vendor-analytics` and related tests already exclude `rejected` /
  `cancelled` orders from revenue calculations — no change needed there,
  but worth a quick check that nothing in that suite asserts on
  `payments` rows existing for `pending` orders.
- Manual/integration check once migrated: place order → confirm no wallet
  deduction and no `payments` row → cancel → confirm status flips to
  `cancelled` and balance is untouched → place another order → accept as
  vendor → confirm wallet debited and `payments` row appears → reject a
  separate pending order → confirm no wallet change.
