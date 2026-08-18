-- Migration: order_status_notifications
-- Creates: notifications table + notify_order_status_change() trigger on orders.
--
-- src/app/notifications.tsx previously rendered MOCK_NOTIFICATIONS only --
-- nothing ever wrote a real row when an order's status changed, so the
-- screen (and home bell) never reflected reality. This adds the missing
-- write path as a trigger rather than an insert from client/RPC code,
-- because order status is currently set from several places (direct
-- .update({status}) calls in vendor-store.ts, and finalize_order_handoff()
-- in 20260818030000_two_sided_handoff_confirmation.sql) -- a trigger catches
-- every one of them, including future ones, without each call site needing
-- to remember to also write a notification.

-- ─── notifications ───────────────────────────────────────────────────────────
create table public.notifications (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        references public.users(id) on delete cascade not null,
  order_id   uuid        references public.orders(id) on delete cascade not null,
  type       text        not null default 'order' check (type in ('order')),
  icon       text        not null,
  title      text        not null,
  body       text        not null,
  read       boolean     not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "notifications: read own"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notifications: mark own read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No insert policy for authenticated clients: the only insert path is
-- notify_order_status_change() below, which runs security definer and
-- bypasses RLS entirely.

-- ─── notify_order_status_change() ───────────────────────────────────────────
create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor_name text;
  v_icon        text;
  v_title       text;
  v_body        text;
  v_queue       text;
begin
  if new.status is distinct from old.status
     and new.status in ('accepted', 'ready', 'rejected', 'completed') then

    select name into v_vendor_name from public.vendors where id = new.vendor_id;
    v_queue := coalesce(new.queue_number::text, '—');

    case new.status
      when 'accepted' then
        v_icon  := '👨‍🍳';
        v_title := 'Order accepted!';
        v_body  := v_vendor_name || ' is preparing your order · Queue #' || v_queue;
      when 'ready' then
        v_icon  := '🎉';
        v_title := 'Order ready for pickup!';
        v_body  := v_vendor_name || ' · Queue #' || v_queue;
      when 'rejected' then
        v_icon  := '😕';
        v_title := 'Order rejected';
        v_body  := v_vendor_name || ' couldn''t accept your order — refund processing';
      when 'completed' then
        v_icon  := '✅';
        v_title := 'Order picked up';
        v_body  := 'Enjoy your meal from ' || v_vendor_name || '!';
    end case;

    insert into public.notifications (user_id, order_id, type, icon, title, body)
    values (new.user_id, new.id, 'order', v_icon, v_title, v_body);
  end if;

  return new;
end;
$$;

create trigger order_status_notify
  after update on public.orders
  for each row
  execute function public.notify_order_status_change();
