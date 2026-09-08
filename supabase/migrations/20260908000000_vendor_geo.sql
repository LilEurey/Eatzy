-- Vendor store location: optional GPS pin dropped by the vendor, shown to students
-- as a read-only mini map on the store detail screen. Nullable; no PostGIS.
alter table public.vendors
  add column latitude  double precision,
  add column longitude double precision;
