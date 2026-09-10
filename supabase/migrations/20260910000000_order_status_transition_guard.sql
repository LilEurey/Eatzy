-- Migration: order_status_transition_guard
-- The vendor's UPDATE policy ("orders: vendor owner updates own stall",
-- 20260818030000) allows any status except 'completed'. RLS WITH CHECK can't
-- see OLD, so nothing constrains the *transition* — only the destination.
-- Consequences reachable today from a vendor's own session:
--
--   1. pending -> ready, skipping accept_order_and_charge(). That RPC is the
--      ONLY wallet-charge point since 20260904010000, so the student eats
--      without ever being charged. (The vendor isn't paid either — no
--      payments row exists, so finalize_order_handoff returns early — but a
--      colluding pair gets free food, and the order's money state is a lie.)
--      vendor-store.ts's markReady() sends exactly this UPDATE with no status
--      guard of its own.
--   2. rejected/cancelled -> accepted/ready, resurrecting a dead order.
--
-- Guarding markReady() in the app would fix one caller; the hole is the
-- table's, so the guard goes on the table. A BEFORE UPDATE trigger is the
-- only place that sees OLD and NEW together, and it covers every caller —
-- app, PostgREST, the SECURITY DEFINER RPCs, and the pg_cron fallback.
--
-- Every transition the codebase actually performs is allowed:
--   pending  -> accepted   accept_order_and_charge
--   pending  -> rejected   vendor-store rejectOrder + the insufficient-balance
--                          auto-reject inside accept_order_and_charge
--   pending  -> cancelled  "orders: student cancels own pending"
--   accepted -> ready      vendor-store markReady
--   ready    -> completed  finalize_order_handoff (both sides / cron)
--
-- accepted/ready -> rejected|cancelled is also allowed. No code path takes it
-- yet, but refund_escrow() exists precisely to unwind a charged order, and
-- forbidding it would make an accepted order impossible to ever unwind —
-- stuck escrow is a worse failure than the hole it would close.
-- The three terminal states are terminal.

create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not (
    (old.status = 'pending'  and new.status in ('accepted', 'rejected', 'cancelled')) or
    (old.status = 'accepted' and new.status in ('ready', 'rejected', 'cancelled'))    or
    (old.status = 'ready'    and new.status in ('completed', 'cancelled'))
  ) then
    raise exception 'invalid_order_status_transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_order_status_transition on public.orders;
create trigger enforce_order_status_transition
  before update of status on public.orders
  for each row
  execute function public.enforce_order_status_transition();
