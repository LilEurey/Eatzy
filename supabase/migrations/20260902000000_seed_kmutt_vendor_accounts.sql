-- Migration: seed_kmutt_vendor_accounts
-- The 16 real KMUTT stalls seeded in 20260830152020_seed_kmutt_menu_items.sql
-- were inserted as plain `vendors` rows with no `owner_user_id` — they predate
-- the admin-provisioned email/password vendor login (20260830140105
-- provision_vendor). None of them have ever been loggable-into at
-- /vendor-login. This creates one auth account per stall and links it via
-- owner_user_id, the same way admin-create-vendor's provision_vendor does,
-- but linking to the existing named row instead of inserting a new one.
--
-- Login is manager@<slug>.eatzy.app for every stall below, password
-- eatzy1234 for all 16 (same shared dev password convention as
-- 20260804015000_local_dev_seed_auth_users.sql). Rotate these before any
-- real vendor takes over a stall.
--
-- Idempotent: skips a stall whose vendors row already has an owner, and
-- reuses an existing auth.users row by email instead of erroring on re-run.

do $$
declare
  v_map jsonb := '[
    {"name":"Dino Papa",             "slug":"dinopapa"},
    {"name":"Fahsai Restaurant",     "slug":"fahsai"},
    {"name":"Loong Noom Square",     "slug":"loongnoom"},
    {"name":"Uncle Chicky",          "slug":"unclechicky"},
    {"name":"P'' Pom",               "slug":"ppom"},
    {"name":"Krua Thai",             "slug":"kruathai"},
    {"name":"P'' Mee",               "slug":"pmee"},
    {"name":"Pa Kaew",               "slug":"pakaew"},
    {"name":"Som Tum",               "slug":"somtum"},
    {"name":"Mae Nong Punch",        "slug":"maenongpunch"},
    {"name":"Dormitory Drinks",      "slug":"dormitorydrinks"},
    {"name":"Mr.Mouslache",          "slug":"mrmouslache"},
    {"name":"Sai Nua Kitchen",       "slug":"sainua"},
    {"name":"Jirapan Drinks",        "slug":"jirapandrinks"},
    {"name":"Nui Noodles",           "slug":"nuinoodles"},
    {"name":"Thanaporn Fresh Milk",  "slug":"thanapornmilk"}
  ]';
  r record;
  v_vendor_id uuid;
  v_owner uuid;
  v_user_id uuid;
  v_email text;
begin
  for r in select * from jsonb_to_recordset(v_map) as x(name text, slug text)
  loop
    select id, owner_user_id into v_vendor_id, v_owner
      from public.vendors where name = r.name;

    if v_vendor_id is null then
      raise notice 'vendor % not found, skipping', r.name;
      continue;
    end if;

    if v_owner is not null then
      raise notice 'vendor % already has an owner, skipping', r.name;
      continue;
    end if;

    v_email := 'manager@' || r.slug || '.eatzy.app';

    select id into v_user_id from auth.users where email = v_email;

    if v_user_id is null then
      v_user_id := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token,
        created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000', v_user_id,
        'authenticated', 'authenticated', v_email,
        extensions.crypt('eatzy1234', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('full_name', r.name || ' Manager'),
        '', '', '', '', '', '', '', '',
        now(), now()
      );

      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        v_user_id, v_user_id, v_user_id::text,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;

    -- on_auth_user_created mirrors the new auth.users row into public.users
    -- (default role 'student'); flip it to vendor the same way provision_vendor does.
    perform set_config('app.bypass_role_guard', 'on', true);
    update public.users set role = 'vendor' where id = v_user_id;

    update public.vendors set owner_user_id = v_user_id where id = v_vendor_id;
  end loop;
end $$;
