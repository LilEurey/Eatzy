-- Migration: seed_dino_todays_sales_velocity
-- The 2026-09-08 demo seed (20260908010000) dated its Dino Papa order history
-- and live KDS queue relative to `now()` at push time. Once that day passes,
-- vendor overview's "today" range (Sales Velocity bars, Total Orders,
-- Revenue Today, Top Sellers) goes empty again, and the old live
-- pending/accepted/ready orders (901-905) are stuck open forever since
-- nothing ever advances them.
--
-- This seeds a fresh day of Dino Papa order history so the vendor dashboard
-- demoes well on whichever day it's pushed, and closes out the stale live
-- queue from the prior seed so it doesn't clutter today's KDS / Active Queue.
-- Catalog (vendors, menu_items) untouched.
--
-- Idempotent: pg_temp.mk_order() early-returns on existing order id; the
-- stale-queue cleanup only touches orders still pending/accepted/ready.
-- Re-running `supabase db push` same day is a no-op for the historical rows;
-- run again on a later day to refresh "today" for that day's demo.

alter table public.orders disable trigger order_notify_vendor;
alter table public.orders disable trigger order_status_notify;

create or replace function pg_temp.mk_order(
  p_id      uuid,
  p_user    uuid,
  p_vendor  uuid,
  p_status  text,
  p_items   uuid[],
  p_qtys    int[],
  p_created timestamptz,
  p_queue   int
) returns void
language plpgsql
as $fn$
declare
  v_total numeric;
  i int;
begin
  insert into public.orders (
    id, user_id, vendor_id, queue_number, status,
    subtotal, packaging_fee, total_amount, payment_method,
    pickup_start, pickup_end, estimated_prep_minutes, time_segment, created_at
  )
  values (
    p_id, p_user, p_vendor, p_queue, p_status,
    0, 5, 0, 'wallet',
    p_created + interval '15 minutes', p_created + interval '35 minutes',
    12, 'lunch', p_created
  )
  on conflict (id) do nothing;

  if not found then
    return;
  end if;

  for i in 1 .. array_length(p_items, 1) loop
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price)
    values (p_id, p_items[i], p_qtys[i], 0);
  end loop;

  select total_amount into v_total from public.orders where id = p_id;

  if p_status in ('accepted', 'ready', 'completed') then
    insert into public.payments (order_id, amount, method, status, paid_at)
    values (
      p_id, v_total, 'wallet',
      case when p_status = 'completed' then 'completed' else 'pending' end,
      case when p_status = 'completed' then p_created + interval '40 minutes' else null end
    )
    on conflict (order_id) do nothing;

    insert into public.wallet_transactions (user_id, type, amount, reference, description, created_at)
    values (p_user, 'payment', -v_total, p_id::text, 'Order payment held in escrow', p_created);

    if p_status = 'completed' then
      update public.orders
         set vendor_handed_off_at = p_created + interval '32 minutes',
             student_picked_up_at = p_created + interval '35 minutes'
       where id = p_id;

      insert into public.wallet_transactions (user_id, type, amount, reference, description, created_at)
      select v.owner_user_id, 'transfer', v_total, p_id::text, 'Escrow released for completed order',
             p_created + interval '40 minutes'
        from public.vendors v
       where v.id = p_vendor and v.owner_user_id is not null;
    end if;
  end if;
end;
$fn$;

do $do$
declare
  v_dino constant uuid := '2fdafae3-a327-44bc-abe5-f3b15a351a14'; -- Dino Papa

  m_kfc_orange constant uuid := '503d881a-27f9-4288-b555-1b7ec4c61a38'; -- KFC Rice + Orange Mayo, 65
  m_kfc_plain  constant uuid := 'db9d67ed-2665-4f60-8984-75eae02c7d6e'; -- KFC Rice, 45
  m_kfc_onsen  constant uuid := 'cb1ecfa4-ed7a-429d-82dc-1198355e1140'; -- KFC Rice + Onsen Egg, 55

  v_students uuid[] := array[
    'ea510000-0000-4000-8000-000000000001'::uuid,
    'ea510000-0000-4000-8000-000000000002'::uuid,
    'ea510000-0000-4000-8000-000000000003'::uuid,
    'ea510000-0000-4000-8000-000000000004'::uuid,
    'ea510000-0000-4000-8000-000000000005'::uuid,
    'ea510000-0000-4000-8000-000000000006'::uuid
  ];

  -- today at a given Bangkok clock hour/minute, as a timestamptz — stable
  -- regardless of what time this migration happens to be pushed at.
  v_today_bkk timestamptz := date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  v_dino_owner uuid;
begin
  select owner_user_id into v_dino_owner from public.vendors where id = v_dino;

  -- ── close out the prior seed's live KDS queue so it stops clogging
  --    today's Active Queue / Orders screen with days-old open tickets ──────
  update public.orders
     set status = 'completed',
         vendor_handed_off_at = created_at + interval '18 minutes',
         student_picked_up_at = created_at + interval '20 minutes'
   where vendor_id = v_dino
     and status in ('pending', 'accepted', 'ready')
     and created_at < v_today_bkk;

  -- ── today's Dino Papa order history — one bar's worth of revenue per hour
  --    across the 9AM-8PM fallback window, lunch (12-13h) and dinner (17h)
  --    peaks, so Sales Velocity / Top Sellers / Revenue Today all render ─────
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003001', v_students[1], v_dino, 'completed', array[m_kfc_plain],  array[1],    v_today_bkk + interval '9 hours 15 minutes',  21);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003002', v_students[2], v_dino, 'completed', array[m_kfc_plain],  array[1],    v_today_bkk + interval '9 hours 50 minutes',  22);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003003', v_students[3], v_dino, 'completed', array[m_kfc_onsen],  array[1],    v_today_bkk + interval '10 hours 20 minutes', 23);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003004', v_students[4], v_dino, 'completed', array[m_kfc_plain],  array[2],    v_today_bkk + interval '11 hours 5 minutes',  24);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003005', v_students[5], v_dino, 'completed', array[m_kfc_orange], array[1],    v_today_bkk + interval '11 hours 40 minutes', 25);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003006', v_students[6], v_dino, 'completed', array[m_kfc_orange], array[2],    v_today_bkk + interval '12 hours 10 minutes', 26);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003007', v_students[1], v_dino, 'completed', array[m_kfc_onsen],  array[1],    v_today_bkk + interval '12 hours 25 minutes', 27);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003008', v_students[2], v_dino, 'completed', array[m_kfc_plain],  array[1],    v_today_bkk + interval '12 hours 50 minutes', 28);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003009', v_students[3], v_dino, 'completed', array[m_kfc_orange], array[1],    v_today_bkk + interval '13 hours 15 minutes', 29);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003010', v_students[4], v_dino, 'completed', array[m_kfc_plain],  array[1],    v_today_bkk + interval '14 hours 5 minutes',  30);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003011', v_students[5], v_dino, 'completed', array[m_kfc_onsen],  array[1],    v_today_bkk + interval '15 hours 30 minutes', 31);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003012', v_students[6], v_dino, 'completed', array[m_kfc_plain],  array[1],    v_today_bkk + interval '16 hours 45 minutes', 32);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003013', v_students[1], v_dino, 'completed', array[m_kfc_orange], array[2],    v_today_bkk + interval '17 hours 10 minutes', 33);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003014', v_students[2], v_dino, 'completed', array[m_kfc_onsen],  array[1],    v_today_bkk + interval '17 hours 40 minutes', 34);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003015', v_students[3], v_dino, 'completed', array[m_kfc_plain],  array[1],    v_today_bkk + interval '18 hours 20 minutes', 35);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003016', v_students[4], v_dino, 'completed', array[m_kfc_orange], array[1],    v_today_bkk + interval '19 hours 5 minutes',  36);

  -- ── fresh live KDS queue at "now" — every column populated for the walkthrough ──
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003101', v_students[5], v_dino, 'pending',  array[m_kfc_orange],             array[1],    now(), 37);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003102', v_students[6], v_dino, 'pending',  array[m_kfc_plain],              array[2],    now(), 38);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003103', v_students[1], v_dino, 'accepted', array[m_kfc_onsen],              array[1],    now(), 39);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003104', v_students[2], v_dino, 'accepted', array[m_kfc_plain, m_kfc_orange], array[1, 1], now(), 40);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000003105', v_students[3], v_dino, 'ready',    array[m_kfc_plain],              array[1],    now(), 41);
  update public.orders set created_at = now() - interval '4 minutes'  where id = 'ea0d0000-0000-4000-8000-000000003101';
  update public.orders set created_at = now() - interval '2 minutes'  where id = 'ea0d0000-0000-4000-8000-000000003102';
  update public.orders set created_at = now() - interval '18 minutes' where id = 'ea0d0000-0000-4000-8000-000000003103';
  update public.orders set created_at = now() - interval '15 minutes' where id = 'ea0d0000-0000-4000-8000-000000003104';
  update public.orders set created_at = now() - interval '26 minutes', pickup_start = now() - interval '3 minutes', pickup_end = now() + interval '6 minutes'
   where id = 'ea0d0000-0000-4000-8000-000000003105';

  if v_dino_owner is not null
     and not exists (select 1 from public.notifications where user_id = v_dino_owner and order_id = 'ea0d0000-0000-4000-8000-000000003101') then
    insert into public.notifications (user_id, order_id, type, icon, title, body, read, event, queue_number, total_amount, created_at)
    select v_dino_owner, o.id, 'order', '🛎️', 'New order!',
           'Queue #' || coalesce(o.queue_number::text, '—') || ' · ฿' || o.total_amount::text,
           false, 'vendor_new_order', o.queue_number, o.total_amount, o.created_at
      from public.orders o
     where o.id in ('ea0d0000-0000-4000-8000-000000003101', 'ea0d0000-0000-4000-8000-000000003102');
  end if;

  -- ── recompute wallet balances touched above (guard-bypassed) ─────────────
  perform set_config('app.bypass_wallet_guard', 'on', true);
  update public.users u
     set wallet_balance = greatest(0, coalesce((
           select sum(w.amount) from public.wallet_transactions w where w.user_id = u.id
         ), 0))
   where u.id = any(v_students) or u.id = v_dino_owner;
end;
$do$;

alter table public.orders enable trigger order_notify_vendor;
alter table public.orders enable trigger order_status_notify;
