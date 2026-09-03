-- Migration: review_photos
-- Lets a rating carry photos of the dish. ratings.photo_urls holds public URLs
-- into the new "review-photos" storage bucket. Objects are keyed
-- "{user_id}/{order_id}-{n}.{ext}" so the RLS policies below scope writes to the
-- reviewer, mirroring the avatars / menu-item-images buckets
-- (see 20260901000000_menu_item_images.sql).

alter table public.ratings
  add column photo_urls text[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('review-photos', 'review-photos', true)
on conflict (id) do nothing;

create policy "review-photos: public read"
  on storage.objects for select
  using (bucket_id = 'review-photos');

create policy "review-photos: reviewer upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "review-photos: reviewer update own"
  on storage.objects for update
  using (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "review-photos: reviewer delete own"
  on storage.objects for delete
  using (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
