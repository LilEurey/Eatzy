-- Migration: hardening
-- Lower-severity findings from the 2026-09-24 full-codebase audit.

-- ─── Queue count: serialize concurrent writers per stall ─────────────────────
-- The count subquery ran on each statement's snapshot, so two concurrent order
-- writes at one stall could each count without seeing the other and leave
-- current_queue_count off by one until the next order change. Locking the
-- vendor row first makes the second writer wait and count after the first
-- commits (read committed takes a fresh snapshot per statement).
create or replace function public.sync_vendor_queue_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid := coalesce(new.vendor_id, old.vendor_id);
begin
  perform 1 from public.vendors where id = v_vendor_id for update;

  update public.vendors
     set current_queue_count = (
       select count(*) from public.orders
        where vendor_id = v_vendor_id
          and status in ('pending', 'accepted')
     )
   where id = v_vendor_id;

  return coalesce(new, old);
end;
$$;

-- ─── Realtime: vendors ───────────────────────────────────────────────────────
-- vendor-store.ts subscribes to its own vendors row so an admin force
-- open/close from (admin)/vendors reaches the vendor's toggle live.
do $$
begin
  alter publication supabase_realtime add table public.vendors;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ─── Storage: vendor image buckets are vendor-only ───────────────────────────
-- Any signed-in user (students included) could write to their own folder in
-- the vendor image buckets. Public buckets serve getPublicUrl() links without
-- any SELECT policy, so the bucket-wide "public read" SELECT policies only
-- added the ability to list every object; SELECT is scoped to the owner's own
-- folder instead (upsert: true uploads still need SELECT on their own file).
drop policy if exists "menu-item-images: vendor upload own" on storage.objects;
create policy "menu-item-images: vendor upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'menu-item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'vendor')
  );

drop policy if exists "vendor-images: vendor upload own" on storage.objects;
create policy "vendor-images: vendor upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'vendor-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'vendor')
  );

drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: read own"
  on storage.objects for select
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "menu-item-images: public read" on storage.objects;
create policy "menu-item-images: read own"
  on storage.objects for select
  using (bucket_id = 'menu-item-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "vendor-images: public read" on storage.objects;
create policy "vendor-images: read own"
  on storage.objects for select
  using (bucket_id = 'vendor-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "review-photos: public read" on storage.objects;
create policy "review-photos: read own"
  on storage.objects for select
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);
