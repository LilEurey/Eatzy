-- Migration: orders_and_payments
-- Creates: orders, order_items, payments, wallet_transactions, next_queue_number()

-- ─── orders ──────────────────────────────────────────────────────────────────
create table public.orders (
  id                    uuid        default gen_random_uuid() primary key,
  user_id               uuid        references public.users(id) on delete restrict not null,
  vendor_id             uuid        references public.vendors(id) on delete restrict not null,
  queue_number          int,
  status                text        not null default 'pending'
                                    check (status in ('pending','accepted','rejected','ready','completed','cancelled')),
  subtotal              numeric(10,2) not null check (subtotal >= 0),
  packaging_fee         numeric(10,2) not null default 0.00 check (packaging_fee >= 0),
  total_amount          numeric(10,2) not null check (total_amount >= 0),
  payment_method        text        not null default 'wallet'
                                    check (payment_method in ('wallet','promptpay')),
  pickup_start          timestamptz,
  pickup_end            timestamptz,
  estimated_prep_minutes int,
  time_segment          text        check (time_segment in ('breakfast','lunch','dinner','all')),
  created_at            timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "orders: student reads own"
  on public.orders for select
  using (auth.uid() = user_id);

create policy "orders: student inserts own"
  on public.orders for insert
  with check (auth.uid() = user_id);

create policy "orders: student cancels own pending"
  on public.orders for update
  using (auth.uid() = user_id and status = 'pending');


-- ─── order_items ─────────────────────────────────────────────────────────────
create table public.order_items (
  id                   uuid        default gen_random_uuid() primary key,
  order_id             uuid        references public.orders(id) on delete cascade not null,
  menu_item_id         uuid        references public.menu_items(id) on delete restrict not null,
  quantity             int         not null check (quantity > 0),
  unit_price           numeric(10,2) not null check (unit_price >= 0),
  special_instructions text
);

alter table public.order_items enable row level security;

create policy "order_items: read via own order"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

create policy "order_items: insert via own order"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );


-- ─── payments ────────────────────────────────────────────────────────────────
create table public.payments (
  id             uuid        default gen_random_uuid() primary key,
  order_id       uuid        references public.orders(id) on delete restrict not null unique,
  amount         numeric(10,2) not null check (amount >= 0),
  method         text        not null check (method in ('wallet','promptpay')),
  status         text        not null default 'pending'
                             check (status in ('pending','completed','refunded','failed')),
  promptpay_ref  text,
  qr_code_url    text,
  paid_at        timestamptz
);

alter table public.payments enable row level security;

create policy "payments: read own"
  on public.payments for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );


-- ─── wallet_transactions ─────────────────────────────────────────────────────
create table public.wallet_transactions (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references public.users(id) on delete restrict not null,
  type        text        not null check (type in ('topup','payment','refund','transfer')),
  amount      numeric(10,2) not null,
  reference   text,
  description text,
  created_at  timestamptz not null default now()
);

alter table public.wallet_transactions enable row level security;

create policy "wallet_transactions: read own"
  on public.wallet_transactions for select
  using (auth.uid() = user_id);


-- ─── Queue number RPC ────────────────────────────────────────────────────────
create or replace function public.next_queue_number(p_vendor_id uuid)
returns int
language plpgsql security definer
as $$
declare
  v_next int;
begin
  select coalesce(max(queue_number), 0) + 1
    into v_next
    from public.orders
   where vendor_id = p_vendor_id
     and created_at >= current_date
     and status != 'cancelled';
  return v_next;
end;
$$;
