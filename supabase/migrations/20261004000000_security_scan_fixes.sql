-- Security scan 2026-10-01 fixes (CLAUDE-SECURITY-20261001-030003).

-- ─── F8: vendors can't self-assign platform-curated menu_items columns ───────
-- is_featured drives Promoted Foods; release_date orders Latest Release.
-- Client inserts get the defaults (Bangkok day, so no timezone lever);
-- client updates may not touch either column. Admins and service role exempt.
create or replace function public.guard_menu_item_curated_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_featured  := false;
    new.release_date := (now() at time zone 'Asia/Bangkok')::date;
  elsif new.is_featured  is distinct from old.is_featured
     or new.release_date is distinct from old.release_date then
    raise exception 'is_featured and release_date are managed by the platform';
  end if;
  return new;
end;
$$;

create trigger menu_items_guard_curated_columns
  before insert or update on public.menu_items
  for each row execute function public.guard_menu_item_curated_columns();

revoke execute on function public.guard_menu_item_curated_columns() from public, anon, authenticated;

-- ─── F9: kitchen-note cap enforced server-side (client NOTE_MAX = 200) ──────
-- NOT VALID: enforced for new rows without failing on any legacy data.
alter table public.order_items
  add constraint order_items_special_instructions_len
  check (char_length(special_instructions) <= 200) not valid;

-- ─── F5: review photos — at most 3 (rate screen selectionLimit) ─────────────
alter table public.ratings
  add constraint ratings_photo_urls_max3
  check (cardinality(photo_urls) <= 3) not valid;
