-- Migration: two_sided_handoff_confirmation
-- Both vendor (`handOff` in vendor-store.ts) and student (`markPickedUp` in
-- track/[id].tsx) independently set orders.status = 'completed' and then
-- call release_escrow_to_vendor — whichever side does it second hits
-- "order_not_found_or_already_settled" since the payment row is no longer
-- 'pending'. Fixes that by requiring both sides to confirm before the order
-- is marked completed and escrow released: each side sets its own
-- timestamp column, and payout only fires once both are set. Also adds an
-- auto-finalize cron fallback for the case where one side confirms but the
-- other never does (stuck escrow).

alter table public.orders
  add column vendor_handed_off_at  timestamptz,
  add column student_picked_up_at timestamptz;

-- ─── Lock down direct status='completed' updates from the client ──────────────
-- Both sides now go through the RPCs below instead of updating the row
-- directly, so the old "student marks own order completed" path is retired
-- and the vendor's broad update policy can no longer be used to skip the
-- two-sided check.

drop policy "orders: student picks up own ready order" on public.orders;

alter policy "orders: vendor owner updates own stall"
  on public.orders
  using (vendor_id in (select id from public.vendors where owner_user_id = auth.uid()))
  with check (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
    and status <> 'completed'
  );

-- ─── Finalize once both sides have confirmed ───────────────────────────────────
-- Self-contained (doesn't call release_escrow_to_vendor) because the cron
-- fallback below invokes this with no auth.uid() session — the RPCs that
-- call it interactively have already done their own ownership check before
-- setting their confirmation column.
create or replace function public.finalize_order_handoff(p_order_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status             text;
  v_vendor_id          uuid;
  v_vendor_confirmed   boolean;
  v_student_confirmed  boolean;
  v_owner_id           uuid;
  v_amount             numeric;
begin
  select o.status, o.vendor_id,
         (o.vendor_handed_off_at is not null),
         (o.student_picked_up_at is not null)
    into v_status, v_vendor_id, v_vendor_confirmed, v_student_confirmed
    from public.orders o
   where o.id = p_order_id
   for update;

  if not found or v_status <> 'ready' or not v_vendor_confirmed or not v_student_confirmed then
    return;
  end if;

  select p.amount into v_amount
    from public.payments p
   where p.order_id = p_order_id
     and p.status = 'pending';

  if not found then
    return;
  end if;

  update public.orders set status = 'completed' where id = p_order_id;
  update public.payments set status = 'completed', paid_at = now() where order_id = p_order_id;

  select owner_user_id into v_owner_id from public.vendors where id = v_vendor_id;

  if v_owner_id is not null then
    perform set_config('app.bypass_wallet_guard', 'on', true);

    update public.users
       set wallet_balance = wallet_balance + v_amount
     where id = v_owner_id;

    insert into public.wallet_transactions (user_id, type, amount, reference, description)
    values (v_owner_id, 'transfer', v_amount, p_order_id::text, 'Escrow released for completed order');
  end if;
end;
$$;

create or replace function public.vendor_confirm_handoff(p_order_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_status   text;
begin
  select v.owner_user_id, o.status
    into v_owner_id, v_status
    from public.orders o
    join public.vendors v on v.id = o.vendor_id
   where o.id = p_order_id
   for update of o;

  if not found then
    raise exception 'order_not_found';
  end if;

  if auth.uid() is distinct from v_owner_id then
    raise exception 'not_authorized';
  end if;

  if v_status <> 'ready' then
    raise exception 'order_not_ready';
  end if;

  update public.orders
     set vendor_handed_off_at = coalesce(vendor_handed_off_at, now())
   where id = p_order_id;

  perform public.finalize_order_handoff(p_order_id);
end;
$$;

create or replace function public.student_confirm_pickup(p_order_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_status  text;
begin
  select o.user_id, o.status
    into v_user_id, v_status
    from public.orders o
   where o.id = p_order_id
   for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if auth.uid() is distinct from v_user_id then
    raise exception 'not_authorized';
  end if;

  if v_status <> 'ready' then
    raise exception 'order_not_ready';
  end if;

  update public.orders
     set student_picked_up_at = coalesce(student_picked_up_at, now())
   where id = p_order_id;

  perform public.finalize_order_handoff(p_order_id);
end;
$$;

grant execute on function public.vendor_confirm_handoff(uuid) to authenticated;
grant execute on function public.student_confirm_pickup(uuid) to authenticated;

-- ─── Auto-finalize fallback ─────────────────────────────────────────────────
-- If only one side confirmed and pickup_end has been passed for a while,
-- assume the handoff actually happened in person and release the escrow
-- rather than leaving it stuck indefinitely.
create or replace function public.auto_finalize_stale_handoffs()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select id from public.orders
     where status = 'ready'
       and (vendor_handed_off_at is not null or student_picked_up_at is not null)
       and pickup_end < now() - interval '2 hours'
  loop
    update public.orders
       set vendor_handed_off_at  = coalesce(vendor_handed_off_at, now()),
           student_picked_up_at = coalesce(student_picked_up_at, now())
     where id = r.id;

    perform public.finalize_order_handoff(r.id);
  end loop;
end;
$$;

create extension if not exists pg_cron with schema extensions;

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'auto-finalize-stale-handoffs';

select cron.schedule(
  'auto-finalize-stale-handoffs',
  '*/15 * * * *',
  $$select public.auto_finalize_stale_handoffs();$$
);
