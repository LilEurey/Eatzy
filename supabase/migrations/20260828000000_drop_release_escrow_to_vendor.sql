-- Migration: drop_release_escrow_to_vendor
-- release_escrow_to_vendor() was the original single-sided escrow payout.
-- 20260818030000_two_sided_handoff_confirmation replaced it entirely:
-- vendor_confirm_handoff() / student_confirm_pickup() each set their own
-- confirmation column and the payout fires only from finalize_order_handoff()
-- once BOTH are set (or via the auto_finalize_stale_handoffs cron fallback).
--
-- The old function was never revoked from PUBLIC (Postgres grants EXECUTE to
-- PUBLIC on CREATE FUNCTION by default), so it stayed directly invokable over
-- PostgREST by any authenticated user. Its only precondition is
-- payments.status = 'pending', which is true from checkout onward — so a
-- student could call it right after placing an order, paying the vendor
-- before the vendor even accepts. finalize_order_handoff() would then find no
-- pending payment and silently no-op, stranding the order in 'ready' forever.
--
-- No application code calls it (only vendor_confirm_handoff /
-- student_confirm_pickup / refund_escrow are used). Drop it outright rather
-- than just revoking, so the dead SECURITY DEFINER wallet path is gone.

drop function if exists public.release_escrow_to_vendor(uuid);
