-- Migration: seed_vendor_geo
-- 20260908000000_vendor_geo added vendors.latitude/longitude but seeded
-- nothing: a stall's pin is meant to be dropped by its owner from the vendor
-- profile location picker. Every one of the 16 seeded stalls is therefore
-- still NULL, and store/[id].tsx gates its mini map on hasCoords(vendor) — so
-- the map feature silently renders nothing for the entire catalog rather than
-- breaking, and cannot be shown at all without a dev build to pin from.
--
-- These are demo pins for the seeded (fictional) stalls, clustered around the
-- KMUTT Bangmod campus food-court area so the mini map has something real to
-- draw. Offsets are ~10-150m (0.0001 deg lat ~ 11m).
--
-- Idempotent and non-destructive: only fills rows where latitude IS NULL, so a
-- pin a vendor actually dropped from the app is never overwritten, and a
-- re-push is a no-op.

update public.vendors v
   set latitude  = seed.lat,
       longitude = seed.lng
  from (values
    ('Dino Papa',             13.65160, 100.49570),
    ('Fahsai Restaurant',     13.65142, 100.49604),
    ('Loong Noom Square',     13.65118, 100.49561),
    ('Uncle Chicky',          13.65185, 100.49612),
    ('P'' Pom',               13.65098, 100.49598),
    ('Krua Thai',             13.65171, 100.49531),
    ('P'' Mee',               13.65133, 100.49649),
    ('Pa Kaew',               13.65205, 100.49556),
    ('Som Tum',               13.65089, 100.49535),
    ('Mae Nong Punch',        13.65156, 100.49668),
    ('Dormitory Drinks',      13.65224, 100.49601),
    ('Mr.Mouslache',          13.65107, 100.49676),
    ('Sai Nua Kitchen',       13.65193, 100.49508),
    ('Jirapan Drinks',        13.65071, 100.49572),
    ('Nui Noodles',           13.65241, 100.49544),
    ('Thanaporn Fresh Milk',  13.65065, 100.49625)
  ) as seed(name, lat, lng)
 where v.name = seed.name
   and v.latitude is null;
