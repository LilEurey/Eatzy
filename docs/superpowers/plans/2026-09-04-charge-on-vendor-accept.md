# Charge on Vendor Accept Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the student's wallet deduction from order placement to vendor accept, and let students cancel a still-`pending` order for free.

**Architecture:** One new `SECURITY DEFINER` Postgres RPC (`accept_order_and_charge`) replaces `place_order_escrow` as the point where money actually moves; the old direct `orders.status` update on vendor accept is replaced by a call to it. Reject and cancel become plain status flips with no money movement, since nothing is charged until acceptance. Full design rationale lives in `docs/superpowers/specs/2026-09-04-charge-on-vendor-accept-design.md` — read it before starting if anything below is unclear on the "why".

**Tech Stack:** Supabase Postgres (`plpgsql`, RLS), React Native + Expo Router screens, `supabase-js` client, Jest (`ts-jest`, pure-logic tests only — no RN component rendering in this suite).

## Global Constraints

- `tsconfig.json` has `strict: true` — no `any` to silence errors (existing files already use narrow `any` casts on Supabase join rows like `(data as any).vendors` — match that existing local pattern, don't introduce new untyped surface elsewhere).
- Every wallet-mutating RPC is `security definer`, `set search_path = ''`, and must call `perform set_config('app.bypass_wallet_guard', 'on', true);` immediately before any `update ... set wallet_balance = ...` — the `prevent_privileged_self_update` trigger rejects direct `wallet_balance` writes otherwise.
- New/changed `SECURITY DEFINER` RPCs get explicit `revoke execute ... from public, anon` + `grant execute ... to authenticated`, matching `20260829133759_harden_function_execute_grants.sql`. Nothing should be left at Postgres's default (`PUBLIC` executable).
- Match each file's existing styling approach as you edit it — `cart.tsx`, `vendor-store.ts`, and `track/[id].tsx` all use inline `style={{...}}` objects, not NativeWind classes. Don't convert.
- Student-facing strings go through `t('...')` from `useI18n()`; both `src/lib/i18n/en.ts` and `src/lib/i18n/th.ts` must define the same key (the `Record<Locale, Record<TranslationKey, string>>` type in `i18n/index.ts` enforces this — a key present in only one file is a type error). Vendor-side `showAlert(...)` calls in `vendor-store.ts` are plain, non-localized strings today (`'Could not accept order'`, etc.) — match that existing convention for the new one, don't introduce `t()` there.

---

### Task 1: `accept_order_and_charge` RPC, drop `place_order_escrow`

**Files:**
- Create: `supabase/migrations/20260904010000_charge_on_vendor_accept.sql`

**Interfaces:**
- Produces: `public.accept_order_and_charge(p_order_id uuid) returns text` — callable via `supabase.rpc('accept_order_and_charge', { p_order_id })`. Returns `'accepted'` on success, `'insufficient_balance'` when the order was auto-rejected for lack of funds. Raises `order_not_found` / `not_authorized` / `order_not_pending` / `addon_rule_violation` as exceptions (same sentinel-message convention `place_order_escrow` used).
- Consumes: existing `public.orders`, `public.vendors`, `public.payments`, `public.wallet_transactions`, `public.order_items`, `public.order_item_addons`, `public.menu_item_addon_groups`, `public.menu_item_addons` tables and the `app.bypass_wallet_guard` config flag already established by `20260814200000_fix_wallet_balance_rpc_guard.sql`.

This is a schema-only migration (no application code depends on it existing at runtime for `npm test`/`npm run lint` to pass) so there's no red/green Jest cycle for this task — verify it by review + a manual Supabase check instead of automated tests.

- [ ] **Step 1: Write the migration**

```sql
-- Migration: charge_on_vendor_accept
-- Moves the wallet deduction from order placement (place_order_escrow,
-- called from cart.tsx right after the order row is inserted) to vendor
-- acceptance. Before this, a student's money was held from the instant
-- they placed an order — before any vendor had even seen it — with no way
-- to back out. Now:
--
--   - Placing an order just inserts the row (status 'pending'). No charge.
--   - Vendor accept calls this RPC, which is the new charge point.
--   - Vendor reject / student cancel (both only possible pre-accept) are
--     plain status flips — nothing to refund since nothing was charged.
--   - Handoff/payout (finalize_order_handoff) is unchanged: it already
--     only acts on a payments row with status = 'pending', which now only
--     comes into existence post-accept instead of post-placement.
--
-- place_order_escrow is dropped outright rather than left dormant — same
-- precedent as 20260828000000_drop_release_escrow_to_vendor.sql: an unused
-- SECURITY DEFINER wallet-mutating RPC left reachable over PostgREST is a
-- liability, not a convenience. No application code calls it once this
-- ships (see cart.tsx change in the same overall change).
--
-- refund_escrow is untouched — still correct for refunding a payments row
-- with status = 'pending' — but nothing currently calls it either
-- (vendor-store.ts's rejectOrder loses its call in the same overall
-- change, since reject-after-charge isn't a path that exists in the UI).
-- Left in place for future accepted-order-cancel work.

drop function if exists public.place_order_escrow(uuid, uuid, numeric);

create or replace function public.accept_order_and_charge(p_order_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid;
  v_owner_id  uuid;
  v_user_id   uuid;
  v_amount    numeric;
  v_status    text;
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
       and oia.addon_id in (
         select id from public.menu_item_addons where group_id = g.id
       )
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

revoke execute on function public.accept_order_and_charge(uuid) from public, anon;
grant execute on function public.accept_order_and_charge(uuid) to authenticated;
```

- [ ] **Step 2: Sanity-check the migration reads cleanly**

Run: `cat supabase/migrations/20260904010000_charge_on_vendor_accept.sql`
Expected: file present, `drop function` line and `create or replace function public.accept_order_and_charge` both visible, no syntax typos (mismatched `$$`, missing semicolons).

This project has migrations queued that haven't been pushed to the hosted Supabase project yet — do **not** run `npx supabase db push` as part of this task unless the user asks; adding the file to the migrations directory is the deliverable.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260904010000_charge_on_vendor_accept.sql
git commit -m "feat(db): charge student wallet on vendor accept, not order placement"
```

---

### Task 2: Update generated types for the new RPC

**Files:**
- Modify: `src/types/database.types.ts:869-917` (the `Functions` block)

**Interfaces:**
- Consumes: nothing new — this is a type-only change matching Task 1's function signature.
- Produces: `Database['public']['Functions']['accept_order_and_charge']` typed as `{ Args: { p_order_id: string }; Returns: string }`, so `supabase.rpc('accept_order_and_charge', { p_order_id })` type-checks and its `data` comes back typed `string | null`.

Normally `npx supabase gen types typescript --local > src/types/database.types.ts` would regenerate this file, but several migrations on this project are already queued ahead of a hosted `db push` (see the design spec's note on this), so hand-edit to match, same as the rest of that queue.

- [ ] **Step 1: Remove the `place_order_escrow` entry**

In `src/types/database.types.ts`, delete:

```ts
      place_order_escrow: {
        Args: { p_amount: number; p_order_id: string; p_user_id: string }
        Returns: undefined
      }
```

- [ ] **Step 2: Add the `accept_order_and_charge` entry**

Insert as the first entry inside `Functions: {` (alphabetically first), immediately before `auto_finalize_stale_handoffs: { Args: never; Returns: undefined }`:

```ts
      accept_order_and_charge: { Args: { p_order_id: string }; Returns: string }
```

- [ ] **Step 3: Confirm the edit**

Run: `grep -n "place_order_escrow\|accept_order_and_charge" src/types/database.types.ts`
Expected: only the new `accept_order_and_charge` line — no `place_order_escrow` left. Don't run a full `tsc --noEmit` yet: `cart.tsx` still calls `supabase.rpc('place_order_escrow', ...)` at this point (Task 4 removes it) and would now fail to type-check against the narrowed `Functions` keys. The project-wide type-check happens at the end of Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.types.ts
git commit -m "chore(types): swap place_order_escrow for accept_order_and_charge"
```

---

### Task 3: `vendor-store.ts` — charge on accept, no refund on reject

**Files:**
- Modify: `src/lib/vendor-store.ts:251-265` (`acceptOrder`, `rejectOrder`)
- Modify: `src/lib/__tests__/__mocks__/supabase.ts` (extend the shared mock with `rpc()` support and an update-chain method)
- Create: `src/lib/__tests__/vendor-store.test.ts`

**Interfaces:**
- Consumes: `accept_order_and_charge` RPC from Task 1/2 (`supabase.rpc('accept_order_and_charge', { p_order_id: string })` → `{ data: string | null, error }`).
- Produces: `acceptOrder(id: string): Promise<void>`, `rejectOrder(id: string): Promise<void>` — same exported signatures as today, callers (`(vendor)/orders.tsx`) are unaffected.

The shared mock (`src/lib/__tests__/__mocks__/supabase.ts`) currently only supports `select/eq/order/maybeSingle` — no `update()` chain and no `rpc()` at all, because nothing has tested a mutation path yet. Extend it first (additively — every existing test using `__setNextResult` keeps working unchanged), then write the vendor-store tests against it.

- [ ] **Step 1: Extend the shared Supabase mock**

Replace the full contents of `src/lib/__tests__/__mocks__/supabase.ts`:

```ts
// Minimal Supabase stub for pure-logic tests. Each test that cares about a
// query result overrides `__setNextResult` (for .from(...) chains) or
// `__setNextRpcResult` (for .rpc(...) calls) before calling the code under
// test. `__getRpcCalls()` / `__resetMock()` let a test assert an RPC was
// (or wasn't) called, without caring what the mock returned.
let nextResult: { data: unknown; error: unknown } = { data: null, error: null };
let nextRpcResult: { data: unknown; error: unknown } = { data: null, error: null };
let rpcCalls: { name: string; args: unknown }[] = [];

export function __setNextResult(result: { data?: unknown; error?: unknown }) {
  nextResult = { data: result.data ?? null, error: result.error ?? null };
}

export function __setNextRpcResult(result: { data?: unknown; error?: unknown }) {
  nextRpcResult = { data: result.data ?? null, error: result.error ?? null };
}

export function __getRpcCalls() {
  return rpcCalls;
}

export function __resetMock() {
  nextResult = { data: null, error: null };
  nextRpcResult = { data: null, error: null };
  rpcCalls = [];
}

const builder: any = {
  select: () => builder,
  eq: () => builder,
  order: () => builder,
  update: () => builder,
  maybeSingle: () => Promise.resolve(nextResult),
  then: (resolve: (v: unknown) => unknown) => Promise.resolve(nextResult).then(resolve),
};

export const supabase = {
  from: () => builder,
  rpc: (name: string, args?: unknown) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(nextRpcResult);
  },
};
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/__tests__/vendor-store.test.ts`:

```ts
jest.mock('@/lib/alert', () => ({ showAlert: jest.fn() }));

import { __setNextRpcResult, __setNextResult, __getRpcCalls, __resetMock } from './__mocks__/supabase';
import { acceptOrder, rejectOrder } from '@/lib/vendor-store';
import { showAlert } from '@/lib/alert';

describe('acceptOrder', () => {
  beforeEach(() => {
    __resetMock();
    (showAlert as jest.Mock).mockClear();
  });

  it('accepts silently when the RPC charges the student successfully', async () => {
    __setNextRpcResult({ data: 'accepted', error: null });

    await acceptOrder('order-1');

    expect(showAlert).not.toHaveBeenCalled();
  });

  it('alerts the vendor when the RPC auto-rejects for insufficient balance', async () => {
    __setNextRpcResult({ data: 'insufficient_balance', error: null });

    await acceptOrder('order-1');

    expect(showAlert).toHaveBeenCalledWith(
      'Order auto-rejected',
      "Customer's balance changed and is no longer enough to cover this order.",
    );
  });

  it('surfaces an alert if the RPC call itself errors', async () => {
    __setNextRpcResult({ data: null, error: { message: 'network error' } });

    await acceptOrder('order-1');

    expect(showAlert).toHaveBeenCalledWith('Could not accept order', 'network error');
  });
});

describe('rejectOrder', () => {
  beforeEach(() => {
    __resetMock();
    (showAlert as jest.Mock).mockClear();
  });

  it('flips status without calling refund_escrow — nothing was ever charged', async () => {
    __setNextResult({ data: [{ id: 'order-1' }], error: null });

    await rejectOrder('order-1');

    expect(showAlert).not.toHaveBeenCalled();
    expect(__getRpcCalls()).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest vendor-store.test.ts`
Expected: FAIL — `acceptOrder` still does a direct `.update({status:'accepted'})` (no RPC call, so `data`/`error` branching doesn't exist yet), and `rejectOrder` still calls `supabase.rpc('refund_escrow', ...)`, so the "nothing was ever charged" test finds a non-empty `__getRpcCalls()`.

- [ ] **Step 4: Rewrite `acceptOrder` and `rejectOrder`**

In `src/lib/vendor-store.ts`, replace:

```ts
export async function acceptOrder(id: string) {
  const { error } = await supabase.from('orders').update({ status: 'accepted' }).eq('id', id);
  if (error) { showAlert('Could not accept order', error.message); return; }
  if (vendorProfile) await fetchOrders(vendorProfile.id);
  emit();
}

export async function rejectOrder(id: string) {
  const { error } = await supabase.from('orders').update({ status: 'rejected' }).eq('id', id);
  if (error) { showAlert('Could not reject order', error.message); return; }
  const { error: refundError } = await supabase.rpc('refund_escrow', { p_order_id: id });
  if (refundError) showAlert('Order rejected, but refund failed', refundError.message);
  if (vendorProfile) await fetchOrders(vendorProfile.id);
  emit();
}
```

with:

```ts
export async function acceptOrder(id: string) {
  // Charging the student now happens inside this RPC, at the moment the
  // vendor accepts — not at order placement. See accept_order_and_charge
  // in 20260904010000_charge_on_vendor_accept.sql.
  const { data, error } = await supabase.rpc('accept_order_and_charge', { p_order_id: id });
  if (error) { showAlert('Could not accept order', error.message); return; }
  if (data === 'insufficient_balance') {
    showAlert('Order auto-rejected', "Customer's balance changed and is no longer enough to cover this order.");
  }
  if (vendorProfile) await fetchOrders(vendorProfile.id);
  emit();
}

export async function rejectOrder(id: string) {
  // Reject only ever happens pre-accept (see the "incoming" column in
  // (vendor)/orders.tsx) — nothing was charged yet, so there's nothing to
  // refund here anymore.
  const { error } = await supabase.from('orders').update({ status: 'rejected' }).eq('id', id);
  if (error) { showAlert('Could not reject order', error.message); return; }
  if (vendorProfile) await fetchOrders(vendorProfile.id);
  emit();
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest vendor-store.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 6: Run the full suite to check nothing else broke**

Run: `npm test`
Expected: PASS — the mock extension in Step 1 is additive, so `cart-store.test.ts`, `localize.test.ts`, `menu-categories.test.ts`, `time.test.ts`, `vendor-analytics.test.ts` are unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/lib/vendor-store.ts src/lib/__tests__/__mocks__/supabase.ts src/lib/__tests__/vendor-store.test.ts
git commit -m "feat(vendor): accept charges the wallet via RPC, reject no longer refunds"
```

---

### Task 4: `cart.tsx` — stop deducting at checkout

**Files:**
- Modify: `src/app/cart.tsx:138-159`
- Modify: `src/lib/i18n/en.ts` (remove `cart.insufficientBalanceMsg`, `cart.addonRuleMsg`)
- Modify: `src/lib/i18n/th.ts` (remove the same two keys)

**Interfaces:**
- Consumes: nothing new.
- Produces: `submitOrder()` no longer calls `place_order_escrow` (which Task 1 dropped from the database — leaving this call in would make every checkout throw `PGRST202`/function-not-found once the migration ships).

This is a screen component (JSX) — outside the Jest suite's scope (`jest.config.js` roots pure-logic `src/lib/` code only). Verify with `npx tsc --noEmit` + `npm run lint` and the manual walkthrough in Step 3.

- [ ] **Step 1: Remove the escrow call and dead error branch**

In `src/app/cart.tsx`, replace:

```ts
      const { error: escrowError } = await supabase
        .rpc('place_order_escrow', { p_user_id: user.id, p_order_id: order.id, p_amount: total });
      if (escrowError) throw escrowError;

      clearCart();
      router.replace(`/track/${order.id}`);
    } catch (e: any) {
      // Don't strand a pending order when checkout fails after the row was
      // inserted (rule violation / low balance). Best-effort; RLS lets a
      // student delete their own not-yet-paid order.
      if (orderId) await supabase.from('orders').delete().eq('id', orderId);
      const message = e.message === 'insufficient_wallet_balance'
        ? t('cart.insufficientBalanceMsg')
        : e.message === 'addon_rule_violation'
          ? t('cart.addonRuleMsg')
          : e.message === 'vendor_closed'
            ? t('cart.storeClosedMsg')
            : `${e.message}${e.code ? ` [${e.code}]` : ''}${e.details ? `\n${e.details}` : ''}${e.hint ? `\n${e.hint}` : ''}`;
      showAlert(t('cart.orderFailedTitle'), message);
    } finally {
      setPlacing(false);
    }
```

with:

```ts
      clearCart();
      router.replace(`/track/${order.id}`);
    } catch (e: any) {
      // Don't strand a pending order when order_items/addons insertion
      // fails after the orders row itself was created. Best-effort; RLS
      // lets a student delete their own not-yet-paid order. Wallet
      // deduction no longer happens here (see accept_order_and_charge —
      // it now fires when the vendor accepts), so the two failure modes
      // that used to need special-casing here (insufficient_wallet_balance,
      // addon_rule_violation) can no longer occur at this step.
      if (orderId) await supabase.from('orders').delete().eq('id', orderId);
      const message = e.message === 'vendor_closed'
        ? t('cart.storeClosedMsg')
        : `${e.message}${e.code ? ` [${e.code}]` : ''}${e.details ? `\n${e.details}` : ''}${e.hint ? `\n${e.hint}` : ''}`;
      showAlert(t('cart.orderFailedTitle'), message);
    } finally {
      setPlacing(false);
    }
```

- [ ] **Step 2: Remove the now-dead i18n keys**

In `src/lib/i18n/en.ts`, delete:

```ts
  'cart.insufficientBalanceMsg': 'Your Campus Wallet balance is too low for this order. Top up in the Wallet tab and try again.',
```

and:

```ts
  'cart.addonRuleMsg': 'One of your items is missing a required choice. Go back and pick it, then try again.',
```

In `src/lib/i18n/th.ts`, delete the matching two lines:

```ts
  'cart.insufficientBalanceMsg': 'ยอดเงินใน Campus Wallet ไม่พอสำหรับคำสั่งซื้อนี้ กรุณาเติมเงินที่แท็บกระเป๋าเงินแล้วลองใหม่อีกครั้ง',
```

```ts
  'cart.addonRuleMsg': 'มีรายการที่ยังไม่ได้เลือกตัวเลือกที่จำเป็น กรุณากลับไปเลือกแล้วลองใหม่อีกครั้ง',
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors — confirms no other file referenced the two removed keys (a stale `t('cart.insufficientBalanceMsg')` elsewhere would now fail to type-check against `TranslationKey`).

Manual walkthrough once this project's pending migrations (including Task 1's) are pushed to a real environment: place an order as a student, confirm the wallet balance is unchanged and no `payments` row exists for it immediately after checkout.

- [ ] **Step 4: Commit**

```bash
git add src/app/cart.tsx src/lib/i18n/en.ts src/lib/i18n/th.ts
git commit -m "feat(cart): stop deducting wallet balance at checkout"
```

---

### Task 5: Student cancel action on the track screen

**Files:**
- Modify: `src/app/track/[id].tsx`
- Modify: `src/lib/i18n/en.ts` (add 6 new `track.cancel*` keys)
- Modify: `src/lib/i18n/th.ts` (add the same 6 keys)

**Interfaces:**
- Consumes: the existing RLS policy `orders: student cancels own pending` (`20260806000003_fix_order_status_transitions.sql`) — already permits a `pending → cancelled` update for the order's own `user_id`; no RPC or migration needed for this task.
- Produces: a `cancelOrder()` function colocated in `track/[id].tsx`, wired to a new sticky "Cancel Order" action shown only while `status === 'pending'`.

Screen component — outside the Jest suite's scope, same as Task 4. Verify with `npx tsc --noEmit` + `npm run lint` and manual walkthrough.

- [ ] **Step 1: Add the six translation keys**

In `src/lib/i18n/en.ts`, add after the existing `'track.stepPickedUpHint': 'Enjoy your meal!',` line:

```ts
  'track.cancelOrder': 'Cancel Order',
  'track.cancelConfirmTitle': 'Cancel this order?',
  'track.cancelConfirmMsg': "You haven't been charged yet — cancelling now is free.",
  'track.cancelConfirmAction': 'Cancel Order',
  'track.cancelFailedTitle': "Can't cancel now",
  'track.cancelFailedMsg': 'The vendor already started on this order.',
```

In `src/lib/i18n/th.ts`, add after the existing `'track.stepPickedUpHint': 'ทานให้อร่อยนะ!',` line:

```ts
  'track.cancelOrder': 'ยกเลิกคำสั่งซื้อ',
  'track.cancelConfirmTitle': 'ยกเลิกคำสั่งซื้อนี้หรือไม่?',
  'track.cancelConfirmMsg': 'คุณยังไม่ถูกเรียกเก็บเงิน ยกเลิกตอนนี้ได้ฟรี',
  'track.cancelConfirmAction': 'ยกเลิกคำสั่งซื้อ',
  'track.cancelFailedTitle': 'ยกเลิกไม่ได้แล้ว',
  'track.cancelFailedMsg': 'ร้านค้าเริ่มดำเนินการคำสั่งซื้อนี้แล้ว',
```

- [ ] **Step 2: Import `showConfirm`**

In `src/app/track/[id].tsx`, change:

```ts
import { showAlert } from '@/lib/alert';
```

to:

```ts
import { showAlert, showConfirm } from '@/lib/alert';
```

- [ ] **Step 3: Add the `cancelOrder` function**

In `src/app/track/[id].tsx`, immediately after the existing `markPickedUp` function, add:

```ts
  async function cancelOrder() {
    if (!order) return;
    showConfirm(
      t('track.cancelConfirmTitle'),
      t('track.cancelConfirmMsg'),
      async () => {
        // .eq('status', 'pending') is the race guard: if the vendor
        // accepted between this screen's last render and this tap, the
        // update matches zero rows instead of silently cancelling an
        // order the vendor already committed to.
        const { data, error } = await supabase
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', order.id)
          .eq('status', 'pending')
          .select('id');
        if (error) { showAlert(t('common.orderNotFound'), error.message); return; }
        if (!data || data.length === 0) {
          showAlert(t('track.cancelFailedTitle'), t('track.cancelFailedMsg'));
          return;
        }
        router.replace('/(tabs)/orders');
      },
      { confirmLabel: t('track.cancelConfirmAction'), cancelLabel: t('common.cancel'), destructive: true },
    );
  }
```

- [ ] **Step 4: Add the sticky Cancel action**

In `src/app/track/[id].tsx`, immediately before the existing `{isReady && (` sticky-footer block, add:

```tsx
      {status === 'pending' && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: Brand.card, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
          borderTopWidth: 1, borderTopColor: Brand.border,
        }}>
          <Tap
            activeOpacity={0.85}
            onPress={cancelOrder}
            style={{ backgroundColor: '#FEE2E2', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: '#dc2626', fontSize: 16, fontWeight: '700' }}>{t('track.cancelOrder')}</Text>
          </Tap>
        </View>
      )}
```

(`status`, `isReady`, and the `{isReady && (...)}` block right after this are all already defined earlier in the same component — this task only inserts the new block, it doesn't touch the existing ones. The three sticky-footer conditions — `pending`, `isReady`, `completed` — are mutually exclusive on `status`, so ordering among them doesn't matter.)

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Manual walkthrough once Task 1's migration is live: place an order, land on the track screen, confirm the "Cancel Order" button shows while `pending`, tap it, confirm the dialog, confirm it navigates to the orders tab and the order now shows as cancelled with the wallet balance unchanged. Separately: place an order, have the vendor accept it from another session/device before tapping cancel, then tap cancel — confirm the "Can't cancel now" alert fires instead of silently succeeding.

- [ ] **Step 6: Commit**

```bash
git add src/app/track/[id].tsx src/lib/i18n/en.ts src/lib/i18n/th.ts
git commit -m "feat(track): let students cancel a pending order for free"
```

---

## Post-plan check

After all 5 tasks: `npm test && npx tsc --noEmit && npm run lint` should be green. The migration itself only takes effect once pushed to the hosted Supabase project (`npx supabase db push`) — that's a deliberate, separate step per this project's existing pending-migrations convention, not part of any task above.
