-- Security hardening from the 2026-11-14 audit.

-- 1. Trigger functions should not be callable as /rest/v1/rpc/*.
--    Trigger firing does not check EXECUTE, so revoking is safe.
--    is_admin() / get_orders_ahead() stay granted: RLS policies call is_admin()
--    as the querying role, and both return nothing useful to anon.
revoke execute on function public.notify_push() from public, anon, authenticated;
revoke execute on function public.sync_vendor_queue_count() from public, anon, authenticated;
revoke execute on function public.orders_reject_when_vendor_closed() from public, anon, authenticated;

-- 2. Clients may not rewrite their own users.email (admin screens trust it).
create or replace function public.prevent_privileged_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.bypass_role_guard', true) = 'on' then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'role cannot be changed via direct update';
  end if;
  if new.wallet_balance is distinct from old.wallet_balance
     and current_setting('app.bypass_wallet_guard', true) is distinct from 'on' then
    raise exception 'wallet_balance cannot be changed via direct update, use topup_wallet/escrow RPCs';
  end if;
  if current_user in ('authenticated', 'anon') and new.email is distinct from old.email then
    raise exception 'email cannot be changed via direct update';
  end if;
  return new;
end;
$$;

-- 3. A vendor may not move a dish to a stall they do not own.
drop policy if exists "menu_items: owner update" on public.menu_items;
create policy "menu_items: owner update" on public.menu_items
  for update
  using (vendor_id in (select id from public.vendors where owner_user_id = auth.uid()))
  with check (vendor_id in (select id from public.vendors where owner_user_id = auth.uid()));
