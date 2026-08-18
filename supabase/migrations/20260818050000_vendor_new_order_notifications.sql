-- Migration: vendor_new_order_notifications
-- Notifies a vendor's owner_user_id when a student places a new order.
-- Mirrors notify_order_status_change() from 20260818040000 (same
-- notifications table, same notifications_enabled gate) but fires on
-- INSERT rather than status UPDATE, and targets the vendor instead of
-- the student.
--
-- Body uses total_amount rather than item count: cart.tsx inserts the
-- order row first and order_items in a second, separate insert (see
-- src/app/cart.tsx), so an AFTER INSERT trigger on orders fires before
-- any order_items rows exist for this order.

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

  insert into public.notifications (user_id, order_id, type, icon, title, body)
  values (
    v_owner_id,
    new.id,
    'order',
    '🛎️',
    'New order!',
    'Queue #' || coalesce(new.queue_number::text, '—') || ' · ฿' || new.total_amount::text
  );

  return new;
end;
$$;

create trigger order_notify_vendor
  after insert on public.orders
  for each row
  execute function public.notify_vendor_new_order();
