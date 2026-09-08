-- Migration: seed_demo_presentation_data
-- Populates the behavioural / transactional layer for a live demo — synthetic
-- students, order history, wallet ledger, ratings, ML signals, recommendation
-- logs and notifications — WITHOUT touching the real catalog (vendors,
-- menu_items, promotions are left exactly as seeded).
--
-- Everything is namespaced with fixed 'ea...' UUIDs and is idempotent:
--   * pg_temp.mk_order() early-returns when the order id already exists.
--   * The demo-student ML / rec-log / notification / ratings blocks are each
--     guarded by `if not exists (...)`.
--   * auth.users / auth.identities inserts use `on conflict do nothing`.
-- Re-running `supabase db push` is a no-op.
--
-- The demo student's data is keyed to an email held in `v_demo_email` below.
-- It defaults to demo.stu1@eatzy.app (a synthetic student seeded above, password
-- eatzy1234) so the whole student walkthrough is demoable immediately.
-- >>> To present as your own Google account instead: sign into the hosted app
-- >>> with it once (so auth.users / public.users rows exist), set v_demo_email
-- >>> to that address, and re-push (idempotent — only the demo-student block
-- >>> re-runs).
-- If the address is not found the demo-student block is skipped with a notice;
-- the synthetic students / history / KDS data still applies.
--
-- Rollback: delete rows with id / reference in the 'ea%' range from
-- notifications, ratings, ml_interactions, recommendation_log,
-- wallet_transactions, payments, order_items, orders, plus the ea510000-...
-- auth.users rows. Catalog is untouched.

-- ─────────────────────────────────────────────────────────────────────────────
-- Synthetic student auth users (email/password, shared dev password eatzy1234)
-- ─────────────────────────────────────────────────────────────────────────────
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'ea510000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'demo.stu1@eatzy.app',
   extensions.crypt('eatzy1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Anong Suksai"}',
   '', '', '', '', '', '', '', '', now() - interval '40 days', now()),
  ('00000000-0000-0000-0000-000000000000', 'ea510000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'demo.stu2@eatzy.app',
   extensions.crypt('eatzy1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Kittipong Rattana"}',
   '', '', '', '', '', '', '', '', now() - interval '40 days', now()),
  ('00000000-0000-0000-0000-000000000000', 'ea510000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'demo.stu3@eatzy.app',
   extensions.crypt('eatzy1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Mali Thongchai"}',
   '', '', '', '', '', '', '', '', now() - interval '40 days', now()),
  ('00000000-0000-0000-0000-000000000000', 'ea510000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'demo.stu4@eatzy.app',
   extensions.crypt('eatzy1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Somchai Prasert"}',
   '', '', '', '', '', '', '', '', now() - interval '40 days', now()),
  ('00000000-0000-0000-0000-000000000000', 'ea510000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'demo.stu5@eatzy.app',
   extensions.crypt('eatzy1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Naree Wongsa"}',
   '', '', '', '', '', '', '', '', now() - interval '40 days', now()),
  ('00000000-0000-0000-0000-000000000000', 'ea510000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'demo.stu6@eatzy.app',
   extensions.crypt('eatzy1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Preecha Larpkeaw"}',
   '', '', '', '', '', '', '', '', now() - interval '40 days', now())
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select u.id, u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email in ('demo.stu1@eatzy.app','demo.stu2@eatzy.app','demo.stu3@eatzy.app',
                  'demo.stu4@eatzy.app','demo.stu5@eatzy.app','demo.stu6@eatzy.app')
on conflict (provider_id, provider) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Order builder — inserts order + items (+ payment + wallet ledger for
-- accepted/ready/completed). Idempotent per order id.
-- ─────────────────────────────────────────────────────────────────────────────
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
    return; -- already seeded on a previous run
  end if;

  for i in 1 .. array_length(p_items, 1) loop
    -- unit_price is forced from menu_items.price by order_items_enforce_price;
    -- orders.subtotal / total_amount are recomputed by the AFTER trigger.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Bulk seed — notification triggers off for the duration (re-enabled after).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.orders disable trigger order_notify_vendor;
alter table public.orders disable trigger order_status_notify;

do $do$
declare
  -- >>> swap to the presenter's Google address (after a first sign-in) if
  -- >>> presenting as that account instead of demo.stu1 <<<
  v_demo_email text := 'demo.stu1@eatzy.app';

  -- vendors (real catalog ids — read, never written)
  v_dino      constant uuid := '2fdafae3-a327-44bc-abe5-f3b15a351a14'; -- Dino Papa
  v_nui       constant uuid := '70401c7e-9f01-471d-9edb-26da3ad6e002'; -- Nui Noodles
  v_pakaew    constant uuid := 'f125fb03-b15d-42b4-b6de-09e54d45d11c'; -- Pa Kaew
  v_fahsai    constant uuid := '484cd3c9-6570-4570-8cc5-277d58eb39e5'; -- Fahsai Restaurant
  v_ppom      constant uuid := 'a118c4e6-2186-4301-9799-7704315ff794'; -- P' Pom
  v_somtum    constant uuid := '51cc2d94-1f69-43d4-b2cd-94ebf0423bf5'; -- Som Tum
  v_loongnoom constant uuid := 'dcac0570-341c-4b5e-9561-5698d88b66ee'; -- Loong Noom Square

  -- menu items (real catalog ids)
  m_kfc_orange constant uuid := '503d881a-27f9-4288-b555-1b7ec4c61a38'; -- Dino  KFC Rice Orange + Onsen  65
  m_kfc_plain  constant uuid := 'db9d67ed-2665-4f60-8984-75eae02c7d6e'; -- Dino  KFC Rice               45
  m_kfc_onsen  constant uuid := 'cb1ecfa4-ed7a-429d-82dc-1198355e1140'; -- Dino  KFC Rice + Onsen Egg   55
  m_ty_fish    constant uuid := 'be1f16f6-a840-4535-871d-810748b91778'; -- Nui   Tom Yum Noodles Fish Balls (peanuts) 35
  m_red_pork   constant uuid := '5712a5bc-33c9-4737-bd0c-0152a2dcd16c'; -- Nui   Rice Roasted Red Pork  40
  m_wonton     constant uuid := '210573c8-9237-4f76-807d-5b9cbc64a0db'; -- Nui   Pork Wonton Soup       35
  m_pork_ty    constant uuid := 'ad4e7c85-aba8-413f-8696-3a37b4bbd2cb'; -- Pa Kaew  Pork Tom Yum Noodles 35
  m_boat       constant uuid := '8a238aed-885a-458d-9b7c-846fb8c6e938'; -- Pa Kaew  Boat Noodles         35
  m_saba       constant uuid := 'd185961e-81a1-4a88-bbd4-f8d8914cfd0c'; -- Fahsai Grilled Saba Fish Rice 69
  m_bonchon    constant uuid := 'aeedc6c4-9be7-4c04-bea0-5676ca99718f'; -- Fahsai Bonchon Fried Chicken  45
  m_cheese     constant uuid := '853803f1-f281-4b17-b663-93a032201c27'; -- P'Pom  Rice Chicken & Cheese  40
  m_garlic     constant uuid := '8cec61c9-d0fa-46d7-90df-87b343005874'; -- P'Pom  Rice Garlic Fried Pork 40
  m_korat      constant uuid := '7e33385f-d9d4-42d3-b35b-3e8aca4365ee'; -- Som Tum  Tum Korat (peanuts)  45
  m_corn       constant uuid := '7effa244-efc5-4da7-b172-08b1af116350'; -- Som Tum  Sweet Corn Salad     45
  m_milktea    constant uuid := '47936248-1c02-4928-89d6-22de601a8ec0'; -- Loong Noom  Milk Tea          25

  v_students uuid[] := array[
    'ea510000-0000-4000-8000-000000000001'::uuid,
    'ea510000-0000-4000-8000-000000000002'::uuid,
    'ea510000-0000-4000-8000-000000000003'::uuid,
    'ea510000-0000-4000-8000-000000000004'::uuid,
    'ea510000-0000-4000-8000-000000000005'::uuid,
    'ea510000-0000-4000-8000-000000000006'::uuid
  ];

  v_demo_uid  uuid;
  v_dino_owner uuid;
  i int;
  v_stu uuid;
  v_vendor uuid;
  v_items uuid[];
  v_qtys int[];
  v_created timestamptz;
begin
  select owner_user_id into v_dino_owner from public.vendors where id = v_dino;

  -- ── synthetic student profiles ────────────────────────────────────────────
  update public.users set university_id = '65010' || substr(id::text, 1, 3), department = 'Engineering', language = 'en'
   where id = any(v_students);

  insert into public.user_preferences (user_id, is_halal, is_vegetarian, is_jay, spice_level, budget_max, allergies, liked_cuisines, favorite_categories)
  values
    ('ea510000-0000-4000-8000-000000000001', true,  false, false, 2, 80,  '{}',           '{thai,rice,chicken}',        '{"Main Dishes (Rice)"}'),
    ('ea510000-0000-4000-8000-000000000002', false, false, false, 5, 150, '{shellfish}',  '{spicy,isaan,noodle}',       '{Noodles,Appetizers}'),
    ('ea510000-0000-4000-8000-000000000003', false, true,  false, 1, 100, '{eggs}',       '{healthy,vegetarian}',       '{Beverages,Appetizers}'),
    ('ea510000-0000-4000-8000-000000000004', false, false, false, 3, 60,  '{}',           '{noodle,pork,soup}',         '{Noodles}'),
    ('ea510000-0000-4000-8000-000000000005', false, true,  true,  2, 120, '{peanuts}',    '{jay,vegetarian,healthy}',   '{"Main Dishes (Rice)"}'),
    ('ea510000-0000-4000-8000-000000000006', false, false, false, 4, 200, '{}',           '{grilled,chicken,korean}',   '{"Main Dishes (Rice)","Main Dishes"}')
  on conflict (user_id) do nothing;

  -- ── loop A: broad history across 7 vendors (trending + co-occurrence) ──────
  for i in 1 .. 30 loop
    v_stu := v_students[1 + (i % 6)];
    v_created := now() - make_interval(hours => i * 14) - make_interval(mins => (i * 7) % 50);
    case (i % 10)
      when 0 then v_vendor := v_dino;      v_items := array[m_kfc_orange];        v_qtys := array[1];
      when 1 then v_vendor := v_dino;      v_items := array[m_kfc_plain, m_kfc_onsen]; v_qtys := array[1, 1];
      when 2 then v_vendor := v_nui;       v_items := array[m_ty_fish, m_wonton];  v_qtys := array[1, 1];
      when 3 then v_vendor := v_nui;       v_items := array[m_red_pork];           v_qtys := array[2];
      when 4 then v_vendor := v_pakaew;    v_items := array[m_pork_ty, m_boat];    v_qtys := array[1, 1];
      when 5 then v_vendor := v_fahsai;    v_items := array[m_saba];               v_qtys := array[1];
      when 6 then v_vendor := v_fahsai;    v_items := array[m_bonchon];            v_qtys := array[1];
      when 7 then v_vendor := v_ppom;      v_items := array[m_cheese];             v_qtys := array[1];
      when 8 then v_vendor := v_somtum;    v_items := array[m_korat, m_corn];      v_qtys := array[1, 1];
      when 9 then v_vendor := v_loongnoom; v_items := array[m_milktea];            v_qtys := array[2];
    end case;
    perform pg_temp.mk_order(
      ('ea0d0000-0000-4000-8000-' || lpad((100 + i)::text, 12, '0'))::uuid,
      v_stu, v_vendor, 'completed', v_items, v_qtys, v_created, (i % 25) + 1
    );
  end loop;

  -- ── loop B: Dino Papa depth for the vendor dashboard / analytics ──────────
  for i in 1 .. 20 loop
    v_stu := v_students[1 + (i % 6)];
    v_created := now() - make_interval(days => (i % 18)) - make_interval(hours => (i * 5) % 24);
    case (i % 3)
      when 0 then v_items := array[m_kfc_orange];             v_qtys := array[1];
      when 1 then v_items := array[m_kfc_plain];              v_qtys := array[1];
      when 2 then v_items := array[m_kfc_onsen, m_kfc_plain]; v_qtys := array[1, 1];
    end case;
    perform pg_temp.mk_order(
      ('ea0d0000-0000-4000-8000-' || lpad((200 + i)::text, 12, '0'))::uuid,
      v_stu, v_dino, 'completed', v_items, v_qtys, v_created, (i % 20) + 1
    );
  end loop;

  -- ── live Dino Papa KDS — every column populated ───────────────────────────
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000901', v_students[2], v_dino, 'pending',  array[m_kfc_orange],             array[1],    now(), 14);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000902', v_students[4], v_dino, 'pending',  array[m_kfc_plain],              array[2],    now(), 15);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000903', v_students[1], v_dino, 'accepted', array[m_kfc_onsen],              array[1],    now(), 12);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000904', v_students[6], v_dino, 'accepted', array[m_kfc_plain, m_kfc_orange], array[1, 1], now(), 13);
  perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000905', v_students[3], v_dino, 'ready',    array[m_kfc_plain],              array[1],    now(), 11);
  update public.orders set created_at = now() - interval '4 minutes'  where id = 'ea0d0000-0000-4000-8000-000000000901';
  update public.orders set created_at = now() - interval '2 minutes'  where id = 'ea0d0000-0000-4000-8000-000000000902';
  update public.orders set created_at = now() - interval '18 minutes' where id = 'ea0d0000-0000-4000-8000-000000000903';
  update public.orders set created_at = now() - interval '15 minutes' where id = 'ea0d0000-0000-4000-8000-000000000904';
  update public.orders set created_at = now() - interval '26 minutes', pickup_start = now() - interval '3 minutes', pickup_end = now() + interval '6 minutes'
   where id = 'ea0d0000-0000-4000-8000-000000000905';

  -- ═════════════════════════════════════════════════════════════════════════
  -- Demo student (the presenter's real account)
  -- ═════════════════════════════════════════════════════════════════════════
  select id into v_demo_uid from auth.users where email = v_demo_email;

  if v_demo_uid is null then
    raise notice 'demo student % not found in auth.users — skipping demo-student block (sign in once, set v_demo_email, re-push)', v_demo_email;
  else
    -- preferences: peanuts allergy drives the Add-Anyway warn + search badge;
    -- liked cuisines / favourite categories align with catalog vocab so
    -- recommend-for-you returns hits.
    insert into public.user_preferences (user_id, is_halal, is_vegetarian, is_jay, spice_level, budget_max, allergies, liked_cuisines, favorite_categories)
    values (v_demo_uid, false, false, false, 3, 120, '{peanuts}', '{thai,grilled,chicken,noodle,spicy}', '{Noodles,"Main Dishes (Rice)",Appetizers}')
    on conflict (user_id) do update
      set is_halal = excluded.is_halal,
          is_vegetarian = excluded.is_vegetarian,
          is_jay = excluded.is_jay,
          spice_level = excluded.spice_level,
          budget_max = excluded.budget_max,
          allergies = excluded.allergies,
          liked_cuisines = excluded.liked_cuisines,
          favorite_categories = excluded.favorite_categories;

    -- wallet top-ups (balance is recomputed from the ledger at the end)
    if not exists (select 1 from public.wallet_transactions where user_id = v_demo_uid and reference = 'ea-demo-topup-1') then
      insert into public.wallet_transactions (user_id, type, amount, reference, description, created_at) values
        (v_demo_uid, 'topup', 1200, 'ea-demo-topup-1', 'Wallet top-up', now() - interval '20 days'),
        (v_demo_uid, 'topup', 300,  'ea-demo-topup-2', 'Wallet top-up', now() - interval '5 days');
    end if;

    -- order history (overlaps the synthetic students' picks so
    -- get_because_you_ordered has co-occurrence to work with)
    perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000801', v_demo_uid, v_nui,       'completed', array[m_ty_fish, m_wonton], array[1, 1], now() - interval '2 days',  7);
    perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000802', v_demo_uid, v_pakaew,    'completed', array[m_pork_ty],           array[1],    now() - interval '5 days',  4);
    perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000803', v_demo_uid, v_dino,      'completed', array[m_kfc_orange],        array[1],    now() - interval '7 days',  9);
    perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000804', v_demo_uid, v_fahsai,    'completed', array[m_saba],              array[1],    now() - interval '9 days',  3);
    perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000805', v_demo_uid, v_ppom,      'completed', array[m_cheese],            array[1],    now() - interval '11 days', 6);
    perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000806', v_demo_uid, v_loongnoom, 'completed', array[m_milktea],           array[2],    now() - interval '12 days', 8);
    perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000807', v_demo_uid, v_nui,       'completed', array[m_red_pork],          array[1],    now() - interval '13 days', 5);
    perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000808', v_demo_uid, v_dino,      'completed', array[m_kfc_plain],         array[1],    now() - interval '3 days',  10); -- left UNRATED
    perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000810', v_demo_uid, v_fahsai,    'rejected',  array[m_bonchon],           array[1],    now() - interval '6 days',  0);

    -- active order at Dino Papa → Track screen + shows on the KDS accepted column
    perform pg_temp.mk_order('ea0d0000-0000-4000-8000-000000000809', v_demo_uid, v_dino, 'accepted', array[m_kfc_orange, m_kfc_plain], array[1, 1], now(), 16);
    update public.orders
       set created_at = now() - interval '10 minutes',
           pickup_start = now() + interval '8 minutes',
           pickup_end = now() + interval '23 minutes'
     where id = 'ea0d0000-0000-4000-8000-000000000809';

    -- ratings on 5 of the completed orders (808 stays unrated)
    if not exists (select 1 from public.ratings where user_id = v_demo_uid and order_id = 'ea0d0000-0000-4000-8000-000000000801') then
      insert into public.ratings (user_id, menu_item_id, order_id, score, comment, created_at) values
        (v_demo_uid, m_ty_fish, 'ea0d0000-0000-4000-8000-000000000801', 5, 'Broth was incredible, will order again', now() - interval '2 days' + interval '2 hours'),
        (v_demo_uid, m_pork_ty, 'ea0d0000-0000-4000-8000-000000000802', 4, null, now() - interval '5 days' + interval '1 hour'),
        (v_demo_uid, m_kfc_orange, 'ea0d0000-0000-4000-8000-000000000803', 5, 'Best fried chicken rice on campus', now() - interval '7 days' + interval '3 hours'),
        (v_demo_uid, m_saba, 'ea0d0000-0000-4000-8000-000000000804', 3, 'A bit dry today', now() - interval '9 days' + interval '2 hours'),
        (v_demo_uid, m_cheese, 'ea0d0000-0000-4000-8000-000000000805', 4, null, now() - interval '11 days' + interval '1 hour');
    end if;

    -- ML interaction signals (view / click / order / skip; some were recommended)
    if not exists (select 1 from public.ml_interactions where user_id = v_demo_uid) then
      insert into public.ml_interactions (user_id, menu_item_id, action, view_duration_sec, was_recommended, created_at) values
        (v_demo_uid, m_kfc_orange, 'view', 35, true,  now() - interval '8 days'),
        (v_demo_uid, m_kfc_plain,  'view', 12, false, now() - interval '8 days'),
        (v_demo_uid, m_saba,       'view', 28, true,  now() - interval '10 days'),
        (v_demo_uid, m_cheese,     'view', 20, false, now() - interval '12 days'),
        (v_demo_uid, m_pork_ty,    'view', 15, false, now() - interval '5 days'),
        (v_demo_uid, m_ty_fish,    'view', 40, true,  now() - interval '2 days'),
        (v_demo_uid, m_boat,       'view', 9,  false, now() - interval '5 days'),
        (v_demo_uid, m_korat,      'view', 18, true,  now() - interval '4 days'),
        (v_demo_uid, m_milktea,    'view', 6,  false, now() - interval '12 days'),
        (v_demo_uid, m_bonchon,    'view', 22, true,  now() - interval '6 days'),
        (v_demo_uid, m_red_pork,   'view', 11, false, now() - interval '13 days'),
        (v_demo_uid, m_wonton,     'view', 14, false, now() - interval '2 days'),
        (v_demo_uid, m_kfc_orange, 'click', null, true,  now() - interval '8 days'),
        (v_demo_uid, m_saba,       'click', null, true,  now() - interval '10 days'),
        (v_demo_uid, m_ty_fish,    'click', null, true,  now() - interval '2 days'),
        (v_demo_uid, m_cheese,     'click', null, false, now() - interval '12 days'),
        (v_demo_uid, m_korat,      'click', null, true,  now() - interval '4 days'),
        (v_demo_uid, m_ty_fish,    'order', null, true,  now() - interval '2 days'),
        (v_demo_uid, m_pork_ty,    'order', null, false, now() - interval '5 days'),
        (v_demo_uid, m_kfc_orange, 'order', null, true,  now() - interval '7 days'),
        (v_demo_uid, m_saba,       'order', null, true,  now() - interval '9 days'),
        (v_demo_uid, m_cheese,     'order', null, false, now() - interval '11 days'),
        (v_demo_uid, m_milktea,    'order', null, false, now() - interval '12 days'),
        (v_demo_uid, m_red_pork,   'order', null, false, now() - interval '13 days'),
        (v_demo_uid, m_boat,       'skip', null, true,  now() - interval '5 days'),
        (v_demo_uid, m_bonchon,    'skip', null, true,  now() - interval '6 days'),
        (v_demo_uid, m_corn,       'skip', null, false, now() - interval '4 days');
    end if;

    -- recommendation log — one row per home-screen row type
    if not exists (select 1 from public.recommendation_log where user_id = v_demo_uid) then
      insert into public.recommendation_log (user_id, row_type, recommendation_type, item_ids, match_score, served_at) values
        (v_demo_uid, 'recommended_for_you', 'content_based_tfidf',    array[m_kfc_orange, m_saba, m_cheese, m_pork_ty, m_ty_fish], 0.42, now() - interval '3 hours'),
        (v_demo_uid, 'because_you_ordered', 'collaborative_filtering', array[m_kfc_plain, m_boat, m_bonchon, m_red_pork],           0.31, now() - interval '3 hours'),
        (v_demo_uid, 'trending',            'popularity',              array[m_kfc_orange, m_ty_fish, m_pork_ty, m_milktea],         null, now() - interval '1 day'),
        (v_demo_uid, 'similar',             'content_based_tfidf',     array[m_kfc_plain, m_kfc_onsen, m_bonchon, m_saba],           0.55, now() - interval '1 day'),
        (v_demo_uid, 'time_based',          'time_context',            array[m_saba, m_cheese],                                      null, now() - interval '2 days'),
        (v_demo_uid, 'promoted',            'sponsored',               array[m_kfc_orange, m_saba, m_cheese],                        null, now() - interval '2 days');
    end if;

    -- notifications (curated) — one unread → bell badge shows
    if not exists (select 1 from public.notifications where user_id = v_demo_uid and order_id = 'ea0d0000-0000-4000-8000-000000000801') then
      insert into public.notifications (user_id, order_id, type, icon, title, body, read, event, vendor_name, queue_number, total_amount, created_at) values
        (v_demo_uid, 'ea0d0000-0000-4000-8000-000000000801', 'order', '✅', 'Order picked up', 'Enjoy your meal from Nui Noodles!', true,  'order_completed', 'Nui Noodles', 7, null, now() - interval '2 days' + interval '40 minutes'),
        (v_demo_uid, 'ea0d0000-0000-4000-8000-000000000803', 'order', '✅', 'Order picked up', 'Enjoy your meal from Dino Papa!',   true,  'order_completed', 'Dino Papa',   9, null, now() - interval '7 days' + interval '40 minutes'),
        (v_demo_uid, 'ea0d0000-0000-4000-8000-000000000810', 'order', '😕', 'Order rejected', 'Fahsai Restaurant couldn''t accept your order — refund processing', true, 'order_rejected', 'Fahsai Restaurant', null, null, now() - interval '6 days'),
        (v_demo_uid, 'ea0d0000-0000-4000-8000-000000000806', 'order', '✅', 'Order picked up', 'Enjoy your meal from Loong Noom Square!', true, 'order_completed', 'Loong Noom Square', 8, null, now() - interval '12 days' + interval '40 minutes'),
        (v_demo_uid, 'ea0d0000-0000-4000-8000-000000000809', 'order', '👨‍🍳', 'Order accepted!', 'Dino Papa is preparing your order · Queue #16', false, 'order_accepted', 'Dino Papa', 16, null, now() - interval '9 minutes');
    end if;
  end if;

  -- ── vendor manager notifications for the live Dino Papa orders ────────────
  if v_dino_owner is not null
     and not exists (select 1 from public.notifications where user_id = v_dino_owner and order_id = 'ea0d0000-0000-4000-8000-000000000901') then
    insert into public.notifications (user_id, order_id, type, icon, title, body, read, event, queue_number, total_amount, created_at)
    select v_dino_owner, o.id, 'order', '🛎️', 'New order!',
           'Queue #' || coalesce(o.queue_number::text, '—') || ' · ฿' || o.total_amount::text,
           false, 'vendor_new_order', o.queue_number, o.total_amount, o.created_at
      from public.orders o
     where o.id in ('ea0d0000-0000-4000-8000-000000000901',
                    'ea0d0000-0000-4000-8000-000000000902',
                    'ea0d0000-0000-4000-8000-000000000809');
  end if;

  -- ── recompute wallet balances from the ledger (guard-bypassed) ───────────
  perform set_config('app.bypass_wallet_guard', 'on', true);

  -- synthetic students get a base top-up so their balance stays positive
  insert into public.wallet_transactions (user_id, type, amount, reference, description, created_at)
  select s, 'topup', 1500, 'ea-stu-topup-' || s::text, 'Wallet top-up', now() - interval '30 days'
    from unnest(v_students) s
   where not exists (
     select 1 from public.wallet_transactions w
      where w.user_id = s and w.reference = 'ea-stu-topup-' || s::text
   );

  update public.users u
     set wallet_balance = greatest(0, coalesce((
           select sum(w.amount) from public.wallet_transactions w where w.user_id = u.id
         ), 0))
   where u.id = any(v_students)
      or u.id = v_demo_uid
      or u.id in (
        select owner_user_id from public.vendors
         where owner_user_id is not null
           and id in (v_dino, v_nui, v_pakaew, v_fahsai, v_ppom, v_somtum, v_loongnoom)
      );
end;
$do$;

alter table public.orders enable trigger order_notify_vendor;
alter table public.orders enable trigger order_status_notify;
