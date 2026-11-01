-- Admin dashboard: one round trip of platform counts + recently active users.
-- "Active" = placed an order or viewed a dish (ml_interactions) recently.
-- shortcut: activity proxy, not live presence; upgrade to Realtime Presence if a true "online now" is needed.
create or replace function public.admin_dashboard_stats()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today timestamptz := date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  result json;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with activity as (
    select user_id, created_at from public.orders
    union all
    select user_id, created_at from public.ml_interactions
  ),
  last_seen as (
    select user_id, max(created_at) as seen_at from activity group by user_id
  )
  select json_build_object(
    'students',        (select count(*) from public.users where role = 'student'),
    'vendors',         (select count(*) from public.users where role = 'vendor'),
    'new_this_week',   (select count(*) from public.users where created_at >= now() - interval '7 days'),
    'active_15m',      (select count(*) from last_seen where seen_at >= now() - interval '15 minutes'),
    'active_today',    (select count(*) from last_seen where seen_at >= today),
    'active_7d',       (select count(*) from last_seen where seen_at >= now() - interval '7 days'),
    'orders_today',    (select count(*) from public.orders where created_at >= today),
    'revenue_today',   (select coalesce(sum(total_amount), 0) from public.orders
                         where created_at >= today and status in ('accepted', 'ready', 'completed')),
    'open_stalls',     (select count(*) from public.vendors where is_open),
    'total_stalls',    (select count(*) from public.vendors),
    'recent_active',   (select coalesce(json_agg(r order by r.seen_at desc), '[]'::json) from (
                          select u.name, u.email, u.role, ls.seen_at
                          from last_seen ls join public.users u on u.id = ls.user_id
                          where ls.seen_at >= now() - interval '1 day'
                          order by ls.seen_at desc limit 20) r)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;
