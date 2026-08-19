-- Migration: notification_localization
-- notify_order_status_change() and notify_vendor_new_order() (from
-- 20260818040000 / 20260818050000) write title/body as pre-rendered
-- English sentences, so the notifications screen shows English text
-- even when the app locale is Thai (same class of bug as the wallet
-- transaction descriptions and menu item names fixed earlier). Add
-- structured columns so the client can render a localized string via
-- i18n instead of the stored English copy. title/body are kept as a
-- fallback for any row an event-less path might someday insert.

alter table public.notifications
  add column if not exists event text
    check (event in ('order_accepted', 'order_ready', 'order_rejected', 'order_completed', 'vendor_new_order')),
  add column if not exists vendor_name text,
  add column if not exists queue_number integer,
  add column if not exists total_amount numeric;

-- ─── notify_order_status_change(): also populate the structured columns ──────
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
  v_event       text;
begin
  if new.status is distinct from old.status
     and new.status in ('accepted', 'ready', 'rejected', 'completed')
     and (select notifications_enabled from public.users where id = new.user_id) then

    select name into v_vendor_name from public.vendors where id = new.vendor_id;
    v_queue := coalesce(new.queue_number::text, '—');

    case new.status
      when 'accepted' then
        v_icon  := '👨‍🍳';
        v_title := 'Order accepted!';
        v_body  := v_vendor_name || ' is preparing your order · Queue #' || v_queue;
        v_event := 'order_accepted';
      when 'ready' then
        v_icon  := '🎉';
        v_title := 'Order ready for pickup!';
        v_body  := v_vendor_name || ' · Queue #' || v_queue;
        v_event := 'order_ready';
      when 'rejected' then
        v_icon  := '😕';
        v_title := 'Order rejected';
        v_body  := v_vendor_name || ' couldn''t accept your order — refund processing';
        v_event := 'order_rejected';
      when 'completed' then
        v_icon  := '✅';
        v_title := 'Order picked up';
        v_body  := 'Enjoy your meal from ' || v_vendor_name || '!';
        v_event := 'order_completed';
    end case;

    insert into public.notifications (user_id, order_id, type, icon, title, body, event, vendor_name, queue_number)
    values (new.user_id, new.id, 'order', v_icon, v_title, v_body, v_event, v_vendor_name, new.queue_number);
  end if;

  return new;
end;
$$;

-- ─── notify_vendor_new_order(): also populate the structured columns ─────────
create or replace function public.notify_vendor_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
begin
  select owner_user_id into v_owner_id from public.vendors where id = new.vendor_id;
  if v_owner_id is null then
    return new;
  end if;

  if not (select notifications_enabled from public.users where id = v_owner_id) then
    return new;
  end if;

  insert into public.notifications (user_id, order_id, type, icon, title, body, event, queue_number, total_amount)
  values (
    v_owner_id,
    new.id,
    'order',
    '🛎️',
    'New order!',
    'Queue #' || coalesce(new.queue_number::text, '—') || ' · ฿' || new.total_amount::text,
    'vendor_new_order',
    new.queue_number,
    new.total_amount
  );

  return new;
end;
$$;

-- ─── Backfill the existing rows written before this migration ────────────────
update public.notifications n
set
  event = case n.title
    when 'Order accepted!'          then 'order_accepted'
    when 'Order ready for pickup!'  then 'order_ready'
    when 'Order rejected'           then 'order_rejected'
    when 'Order picked up'          then 'order_completed'
    when 'New order!'               then 'vendor_new_order'
  end,
  vendor_name = v.name,
  queue_number = o.queue_number,
  total_amount = o.total_amount
from public.orders o
join public.vendors v on v.id = o.vendor_id
where n.order_id = o.id
  and n.event is null;
