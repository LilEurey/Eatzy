-- Drop menu_items.calories: never populated by vendor forms, not read by
-- any app screen or ML script (seed migrations were the only writers).
alter table public.menu_items
  drop column if exists calories;
