-- Every order notification carries the queue number, so a student with
-- several orders can tell which one rejected/refunded/completed refers to.
-- Same function as 20260924010000; only three bodies change.
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
        v_icon := '😕';
        if exists (select 1 from public.payments where order_id = new.id and status = 'refunded') then
          v_title := 'Order cancelled';
          v_body  := v_vendor_name || ' cancelled your order — you''ve been refunded · Queue #' || v_queue;
          v_event := 'order_refunded';
        else
          v_title := 'Order rejected';
          v_body  := v_vendor_name || ' couldn''t accept your order · Queue #' || v_queue;
          v_event := 'order_rejected';
        end if;
      when 'completed' then
        v_icon  := '✅';
        v_title := 'Order picked up';
        v_body  := 'Enjoy your meal from ' || v_vendor_name || '! · Queue #' || v_queue;
        v_event := 'order_completed';
    end case;

    insert into public.notifications (user_id, order_id, type, icon, title, body, event, vendor_name, queue_number)
    values (new.user_id, new.id, 'order', v_icon, v_title, v_body, v_event, v_vendor_name, new.queue_number);
  end if;

  return new;
end;
$$;

revoke execute on function public.notify_order_status_change() from public, anon, authenticated;
