-- Migration: local_dev_seed_auth_users
-- Ordered AFTER 20260613000000_core_tables.sql (which creates public.users plus
-- the on_auth_user_created trigger) and BEFORE the seed migrations that
-- FK-reference / look up auth.users rows originally created out-of-band on the
-- hosted project (Supabase Admin API, or a real Google sign-in):
--   e0a18bdd-d113-4e10-8158-d4b7fe6ee3ad  manager@maleethai.eatzy.app  vendor mgr   (20260804020000_seed_demo_data)
--   3371dde3-8543-4b19-859e-3ecb40e3b925  demo.student1@eatzy.app       demo student (20260804020000_seed_demo_data)
--   d08451a7-e38e-4d98-87fc-3082b7742751  demo.student2@eatzy.app       demo student (20260804020000_seed_demo_data)
--   f2cfd030-c2e4-4518-a9bb-4527d4fa1dba  manager@somtam.eatzy.app      vendor mgr   (20260812030000_reseed_som_tam_dashboard_data)
--   c0ffee00-0000-4000-8000-000000000001  pochvasin.p@gmail.com         dev owner    (20260815010000_seed_everything_vendor, 20260818000000/020000 dev-testing)
-- On a fresh local stack those rows don't exist, so `supabase start` / `db reset`
-- aborts (FK violation, or a `raise exception` in the email-lookup seeds). This
-- recreates them (idempotent) so the local replay matches the hosted DB. On the
-- hosted project every statement here is a no-op via `on conflict do nothing`.
-- Password for all five: eatzy1234
-- The on_auth_user_created trigger mirrors each into public.users automatically.

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'e0a18bdd-d113-4e10-8158-d4b7fe6ee3ad',
   'authenticated', 'authenticated', 'manager@maleethai.eatzy.app',
   extensions.crypt('eatzy1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Malee Manager"}',
   now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3371dde3-8543-4b19-859e-3ecb40e3b925',
   'authenticated', 'authenticated', 'demo.student1@eatzy.app',
   extensions.crypt('eatzy1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Student One"}',
   now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd08451a7-e38e-4d98-87fc-3082b7742751',
   'authenticated', 'authenticated', 'demo.student2@eatzy.app',
   extensions.crypt('eatzy1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Student Two"}',
   now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f2cfd030-c2e4-4518-a9bb-4527d4fa1dba',
   'authenticated', 'authenticated', 'manager@somtam.eatzy.app',
   extensions.crypt('eatzy1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Som Tam Manager"}',
   now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0ffee00-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'pochvasin.p@gmail.com',
   extensions.crypt('eatzy1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Pochvasin Dev"}',
   now(), now())
on conflict (id) do nothing;

-- A raw INSERT leaves the GoTrue token columns NULL. GoTrue scans them into a
-- non-nullable Go `string`, so any user lookup (incl. signInWithPassword) that
-- touches a seeded row crashes 500 with
--   Scan error on column "confirmation_token": converting NULL to string
-- On the hosted project these are already '' (Admin API / OAuth set them), so
-- this WHERE matches nothing there.
update auth.users
set confirmation_token       = coalesce(confirmation_token, ''),
    recovery_token           = coalesce(recovery_token, ''),
    email_change_token_new   = coalesce(email_change_token_new, ''),
    email_change             = coalesce(email_change, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    phone_change             = coalesce(phone_change, ''),
    phone_change_token       = coalesce(phone_change_token, ''),
    reauthentication_token   = coalesce(reauthentication_token, '')
where email in (
  'manager@maleethai.eatzy.app',
  'demo.student1@eatzy.app',
  'demo.student2@eatzy.app',
  'manager@somtam.eatzy.app',
  'pochvasin.p@gmail.com'
)
and (confirmation_token is null or recovery_token is null
     or email_change_token_new is null or email_change is null
     or email_change_token_current is null or phone_change is null
     or phone_change_token is null or reauthentication_token is null);

-- Email-provider identity rows so signInWithPassword resolves these users.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  u.id, u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email in (
  'manager@maleethai.eatzy.app',
  'demo.student1@eatzy.app',
  'demo.student2@eatzy.app',
  'manager@somtam.eatzy.app',
  'pochvasin.p@gmail.com'
)
on conflict (provider_id, provider) do nothing;
