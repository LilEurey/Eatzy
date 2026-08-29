-- Advisors flagged every SECURITY DEFINER function as callable by anon /
-- authenticated over PostgREST (/rest/v1/rpc/...), plus two functions with a
-- mutable search_path. Lock the surface down:
--
--   1. Pin search_path on the two stragglers.
--   2. Trigger functions and internal helpers: revoke EXECUTE from everyone.
--      Triggers still fire (the trigger mechanism doesn't check EXECUTE), and
--      the internal helpers run via `perform` inside other SECURITY DEFINER
--      functions as the owner, so nothing legitimate breaks.
--   3. Escrow / wallet / handoff RPCs and the two read helpers: authenticated
--      only. Each already enforces `auth.uid()` internally; anon can never
--      satisfy those checks, so dropping anon only removes a useless attack
--      surface.

-- 1. Mutable search_path
alter function public.set_updated_at() set search_path = '';
alter function public.next_queue_number(uuid) set search_path = '';

-- 2. Trigger functions + internal helpers — not part of the public API
revoke execute on function public.enforce_order_item_price()      from public, anon, authenticated;
revoke execute on function public.handle_new_user()               from public, anon, authenticated;
revoke execute on function public.notify_order_status_change()     from public, anon, authenticated;
revoke execute on function public.notify_vendor_new_order()        from public, anon, authenticated;
revoke execute on function public.prevent_privileged_self_update() from public, anon, authenticated;
revoke execute on function public.recompute_order_totals()         from public, anon, authenticated;
revoke execute on function public.set_updated_at()                 from public, anon, authenticated;
revoke execute on function public.finalize_order_handoff(uuid)     from public, anon, authenticated;
revoke execute on function public.auto_finalize_stale_handoffs()   from public, anon, authenticated;

-- 3. Real RPCs — authenticated only
revoke execute on function public.place_order_escrow(uuid, uuid, numeric) from public, anon;
revoke execute on function public.topup_wallet(uuid, numeric)             from public, anon;
revoke execute on function public.refund_escrow(uuid)                     from public, anon;
revoke execute on function public.student_confirm_pickup(uuid)            from public, anon;
revoke execute on function public.vendor_confirm_handoff(uuid)            from public, anon;
revoke execute on function public.next_queue_number(uuid)                 from public, anon;
revoke execute on function public.pending_vendor_application_ids()        from public, anon;

grant execute on function public.place_order_escrow(uuid, uuid, numeric) to authenticated;
grant execute on function public.topup_wallet(uuid, numeric)             to authenticated;
grant execute on function public.refund_escrow(uuid)                     to authenticated;
grant execute on function public.student_confirm_pickup(uuid)            to authenticated;
grant execute on function public.vendor_confirm_handoff(uuid)            to authenticated;
grant execute on function public.next_queue_number(uuid)                 to authenticated;
grant execute on function public.pending_vendor_application_ids()        to authenticated;
