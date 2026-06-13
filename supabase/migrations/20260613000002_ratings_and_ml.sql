-- Migration: ratings_and_ml
-- Creates: ratings, ml_interactions, recommendation_log, promotions

-- ─── ratings ─────────────────────────────────────────────────────────────────
create table public.ratings (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        references public.users(id) on delete cascade not null,
  menu_item_id uuid        references public.menu_items(id) on delete cascade not null,
  order_id     uuid        references public.orders(id) on delete set null,
  score        int         not null check (score between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now(),
  unique (user_id, menu_item_id, order_id)
);

alter table public.ratings enable row level security;

create policy "ratings: public read"
  on public.ratings for select
  using (true);

create policy "ratings: insert own"
  on public.ratings for insert
  with check (auth.uid() = user_id);

create policy "ratings: update own"
  on public.ratings for update
  using (auth.uid() = user_id);


-- ─── ml_interactions ─────────────────────────────────────────────────────────
create table public.ml_interactions (
  id                uuid        default gen_random_uuid() primary key,
  user_id           uuid        references public.users(id) on delete cascade not null,
  menu_item_id      uuid        references public.menu_items(id) on delete cascade not null,
  action            text        not null check (action in ('view','click','order','skip')),
  view_duration_sec int,
  was_recommended   boolean     not null default false,
  created_at        timestamptz not null default now()
);

alter table public.ml_interactions enable row level security;

create policy "ml_interactions: insert own"
  on public.ml_interactions for insert
  with check (auth.uid() = user_id);

create policy "ml_interactions: read own"
  on public.ml_interactions for select
  using (auth.uid() = user_id);


-- ─── recommendation_log ──────────────────────────────────────────────────────
create table public.recommendation_log (
  id                  uuid        default gen_random_uuid() primary key,
  user_id             uuid        references public.users(id) on delete cascade not null,
  row_type            text,
  recommendation_type text,
  item_ids            uuid[]      not null default '{}',
  match_score         numeric(6,4),
  served_at           timestamptz not null default now()
);

alter table public.recommendation_log enable row level security;

create policy "recommendation_log: insert own"
  on public.recommendation_log for insert
  with check (auth.uid() = user_id);

create policy "recommendation_log: read own"
  on public.recommendation_log for select
  using (auth.uid() = user_id);


-- ─── promotions ──────────────────────────────────────────────────────────────
create table public.promotions (
  id              uuid        default gen_random_uuid() primary key,
  vendor_id       uuid        references public.vendors(id) on delete cascade not null,
  title           text        not null,
  description     text,
  discount_pct    numeric(5,2) check (discount_pct between 0 and 100),
  target_category text,
  valid_from      timestamptz not null,
  valid_until     timestamptz not null,
  is_active       boolean     not null default true
);

alter table public.promotions enable row level security;

create policy "promotions: public read"
  on public.promotions for select
  using (true);
