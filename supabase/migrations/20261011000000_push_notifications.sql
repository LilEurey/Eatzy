-- Real OS push (sound + banner, like LINE) for every in-app notification.
-- The app registers an Expo push token per user; an AFTER INSERT trigger on
-- notifications posts it to Expo's push API via pg_net. notifications_enabled
-- is already enforced where rows are inserted, so no extra gate here.
-- ponytail: one token per user (last device wins); add a tokens table if
-- students need push on several devices at once.

create extension if not exists pg_net with schema extensions;

alter table public.users add column if not exists expo_push_token text;

create or replace function public.set_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.users set expo_push_token = p_token where id = auth.uid();
$$;

revoke all on function public.set_push_token(text) from public, anon;
grant execute on function public.set_push_token(text) to authenticated;

create or replace function public.notify_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  select expo_push_token into v_token from public.users where id = new.user_id;
  if v_token is null then
    return new;
  end if;

  -- title/body are the English fallback text the insert triggers store;
  -- the in-app list still renders localized text from event + params.
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'to', v_token,
      'title', new.title,
      'body', new.body,
      'sound', 'default',
      'priority', 'high',
      'channelId', 'default',
      'data', jsonb_build_object('order_id', new.order_id)
    )
  );
  return new;
exception when others then
  -- push is best-effort; never block the order/notification insert.
  return new;
end;
$$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.notify_push();
