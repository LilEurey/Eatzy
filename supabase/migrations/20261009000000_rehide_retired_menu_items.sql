-- 20261008010000 originally set is_available on every row, which re-exposed
-- dishes the v3/v4 CSV syncs had retired (e.g. Pa Kaew's Pork Tom Yum Noodles).
-- Hide them again. Ids already deleted are no-ops.
update public.menu_items set is_available = false, updated_at = now()
where is_available and id in (
  'be1f16f6-a840-4535-871d-810748b91778',
  '0b402aad-b9c7-4f5b-9c15-1ecb47bbb451',
  'ad4e7c85-aba8-413f-8696-3a37b4bbd2cb',
  '9d4301bc-f129-417a-bcac-f7fabfef71c8',
  '5ad25676-a3f9-4b1a-a36c-989a5089b571',
  '47bec8b7-40cb-45a6-be7c-363cd33a5ea6',
  '1fbe362b-4189-48d9-91a2-13772e968831',
  '483b448c-6269-4dd4-aa71-9cd728758bdf',
  'b4761f8a-17c8-4c23-b18c-4c23bd5b2cf6',
  'd4433995-9c8d-4d56-be36-c56daf7dc9ca'
);
