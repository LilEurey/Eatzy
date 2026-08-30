-- menu_items had a full policy set (public read + owner insert/update/delete)
-- but RLS was never switched on, so the anon key could read/write every row.
-- Policies already exist; this just activates enforcement.

alter table public.menu_items enable row level security;
