-- Migration: menu_item_images
-- Adds a "menu-item-images" storage bucket. menu_items.image_url previously
-- hotlinked drive.google.com/uc?export=view links, which Google does not
-- guarantee as a stable binary endpoint for non-browser clients (it can
-- intermittently serve an HTML interstitial instead of the image) -- that's
-- why some items showed a picture in the DB but it wouldn't render in the
-- app. Objects are keyed "{vendor_owner_user_id}/{filename}" so the RLS
-- policies below can scope writes to the owning vendor, mirroring the
-- avatars bucket (see 20260804000000_user_avatars.sql).

insert into storage.buckets (id, name, public)
values ('menu-item-images', 'menu-item-images', true)
on conflict (id) do nothing;

create policy "menu-item-images: public read"
  on storage.objects for select
  using (bucket_id = 'menu-item-images');

create policy "menu-item-images: vendor upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'menu-item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "menu-item-images: vendor update own"
  on storage.objects for update
  using (
    bucket_id = 'menu-item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "menu-item-images: vendor delete own"
  on storage.objects for delete
  using (
    bucket_id = 'menu-item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
