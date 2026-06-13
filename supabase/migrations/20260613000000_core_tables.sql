-- Migration: core_tables
-- Creates: users, user_preferences, vendors, menu_items

-- ─── users ───────────────────────────────────────────────────────────────────
-- Extends Supabase Auth (auth.users) with app-specific profile fields.
-- id matches auth.users.id so we never store password hashes ourselves.
create table public.users (
  id             uuid        references auth.users(id) on delete cascade primary key,
  name           text        not null,
  email          text        not null,
  university_id  text,
  role           text        not null default 'student'
                             check (role in ('student', 'vendor', 'admin')),
  department     text,
  language       text        not null default 'en',
  wallet_balance numeric(10,2) not null default 0.00
                             check (wallet_balance >= 0),
  created_at     timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "users: read own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "users: update own profile"
  on public.users for update
  using (auth.uid() = id);

-- Auto-create a public.users row when someone signs up via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ─── user_preferences ────────────────────────────────────────────────────────
create table public.user_preferences (
  user_id             uuid      references public.users(id) on delete cascade primary key,
  is_halal            boolean   not null default false,
  is_vegetarian       boolean   not null default false,
  is_jay              boolean   not null default false,        -- เจ (Thai vegan)
  spice_level         int       not null default 2
                                check (spice_level between 0 and 5),
  budget_max          numeric(10,2),
  allergies           text[]    not null default '{}',
  liked_cuisines      text[]    not null default '{}',
  favorite_categories text[]    not null default '{}'
);

alter table public.user_preferences enable row level security;

create policy "preferences: full access own row"
  on public.user_preferences
  using (auth.uid() = user_id);


-- ─── vendors ─────────────────────────────────────────────────────────────────
create table public.vendors (
  id                  uuid        default gen_random_uuid() primary key,
  name                text        not null,
  stall_number        text,
  is_halal_certified  boolean     not null default false,
  open_time           time,
  close_time          time,
  is_open             boolean     not null default false,
  bio                 text,
  cuisine_tags        text[]      not null default '{}',
  estimated_wait_min  int         not null default 10,
  cover_image_url     text,
  current_queue_count int         not null default 0,
  created_at          timestamptz not null default now()
);

alter table public.vendors enable row level security;

-- All authenticated users can read vendor info.
create policy "vendors: public read"
  on public.vendors for select
  using (true);

-- Vendor owners (matched by user role = vendor) can update their own stall.
-- For now vendor_id linkage comes in a later migration when vendor<>user join is added.


-- ─── menu_items ──────────────────────────────────────────────────────────────
create table public.menu_items (
  id                      uuid        default gen_random_uuid() primary key,
  vendor_id               uuid        references public.vendors(id) on delete cascade not null,
  name                    text        not null,
  description             text,
  price                   numeric(10,2) not null check (price >= 0),
  category                text,
  spice_level             int         not null default 0
                                      check (spice_level between 0 and 5),
  is_available            boolean     not null default true,
  is_halal                boolean     not null default false,
  is_vegetarian           boolean     not null default false,
  is_jay                  boolean     not null default false,
  allergens               text[]      not null default '{}',
  tags                    text[]      not null default '{}',
  ingredients             text[]      not null default '{}',
  calories                int,
  preparation_time_min    int,
  image_url               text,
  is_featured             boolean     not null default false,
  available_time_segment  text        not null default 'all'
                                      check (available_time_segment in ('breakfast', 'lunch', 'dinner', 'all')),
  release_date            date        not null default current_date,
  updated_at              timestamptz not null default now()
);

alter table public.menu_items enable row level security;

create policy "menu_items: public read"
  on public.menu_items for select
  using (true);

-- Keep updated_at current on every row update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger menu_items_set_updated_at
  before update on public.menu_items
  for each row execute procedure public.set_updated_at();
