-- Migration: menu_items_thai_name
-- Adds optional Thai-language name/description to menu_items so the
-- student app can show a localized dish name when locale is 'th'
-- (src/lib/i18n). Nullable: vendors aren't required to fill these in,
-- and every read path falls back to the base name/description when null.

alter table public.menu_items
  add column if not exists name_th text,
  add column if not exists description_th text;
