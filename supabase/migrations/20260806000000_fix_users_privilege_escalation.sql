-- Migration: fix_users_privilege_escalation
-- "users: update own profile" only checks auth.uid() = id, with no column
-- restriction — any student can PATCH their own row with { role: 'admin' }
-- or { wallet_balance: 999999 }, bypassing both the admin gate and the
-- entire escrow/topup RPC system. Block role/wallet_balance from direct
-- UPDATE; they must go through the SECURITY DEFINER RPCs instead.

create or replace function public.prevent_privileged_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'role cannot be changed via direct update';
  end if;
  if new.wallet_balance is distinct from old.wallet_balance then
    raise exception 'wallet_balance cannot be changed via direct update, use topup_wallet/escrow RPCs';
  end if;
  return new;
end;
$$;

create trigger users_prevent_privileged_self_update
  before update on public.users
  for each row execute procedure public.prevent_privileged_self_update();
