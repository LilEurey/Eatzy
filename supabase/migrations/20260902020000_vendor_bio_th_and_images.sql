-- Migration: vendor_bio_th_and_images
-- Adds vendors.bio_th (Thai bio, same fallback pattern as menu_items name_th/
-- description_th via localizedText() in src/lib/localize.ts) and a
-- "vendor-images" storage bucket for vendor cover photos, mirroring
-- "menu-item-images" (20260901000000_menu_item_images.sql). Objects are
-- keyed "{vendor_owner_user_id}/{filename}" so RLS can scope writes to the
-- owning vendor.

alter table vendors add column bio_th text;

insert into storage.buckets (id, name, public)
values ('vendor-images', 'vendor-images', true)
on conflict (id) do nothing;

create policy "vendor-images: public read"
  on storage.objects for select
  using (bucket_id = 'vendor-images');

create policy "vendor-images: vendor upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'vendor-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "vendor-images: vendor update own"
  on storage.objects for update
  using (
    bucket_id = 'vendor-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "vendor-images: vendor delete own"
  on storage.objects for delete
  using (
    bucket_id = 'vendor-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
