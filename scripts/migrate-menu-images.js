// One-off migration: re-hosts menu_items.image_url from Google Drive
// (drive.google.com/uc?export=view&id=...) into the "menu-item-images"
// Supabase Storage bucket. Drive links aren't a stable hotlink endpoint --
// see supabase/migrations/20260901000000_menu_item_images.sql for why.
//
// Usage: SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/migrate-menu-images.js
//
// Idempotent: re-running skips items whose image_url is already on the
// menu-item-images bucket.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://rxrxsgsxbuevclfqwhtu.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'menu-item-images';

if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function extFromContentType(ct) {
  if (ct.includes('png')) return 'png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('webp')) return 'webp';
  return 'bin';
}

async function main() {
  const { data: items, error } = await supabase
    .from('menu_items')
    .select('id, vendor_id, image_url')
    .not('image_url', 'is', null);
  if (error) throw error;

  const driveItems = items.filter((i) => i.image_url.includes('drive.google.com'));
  console.log(`${driveItems.length} items with Drive image_url (of ${items.length} with any image_url).`);

  // Dedupe by Drive file id -- many items share the same picture.
  const byDriveId = new Map();
  for (const item of driveItems) {
    const m = item.image_url.match(/[?&]id=([^&]+)/);
    if (!m) {
      console.warn(`  skip ${item.id}: can't parse Drive id from ${item.image_url}`);
      continue;
    }
    const driveId = m[1];
    if (!byDriveId.has(driveId)) byDriveId.set(driveId, []);
    byDriveId.get(driveId).push(item);
  }
  console.log(`${byDriveId.size} distinct Drive files to fetch.`);

  const urlByDriveId = new Map();
  let uploaded = 0;
  let failed = 0;

  for (const [driveId, group] of byDriveId) {
    // Seed data isn't owned by a vendor user account yet (vendor accounts
    // are created later by an admin), so this admin-run migration -- using
    // the service_role key, which bypasses the owner-scoped RLS policies --
    // files these under a flat "seed/" prefix rather than "{owner_user_id}/".
    const driveUrl = `https://drive.google.com/uc?export=view&id=${driveId}`;
    const res = await fetch(driveUrl);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.startsWith('image/')) {
      console.warn(`  FAIL drive id ${driveId}: status ${res.status}, content-type ${contentType}`);
      failed++;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = extFromContentType(contentType);
    const path = `seed/${driveId}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, { contentType, upsert: true });
    if (upErr) {
      console.warn(`  FAIL upload ${path}: ${upErr.message}`);
      failed++;
      continue;
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    urlByDriveId.set(driveId, pub.publicUrl);
    uploaded++;
    console.log(`  uploaded ${path} (${group.length} menu item(s))`);
  }

  console.log(`Uploaded ${uploaded}, failed ${failed}.`);

  let updated = 0;
  for (const [driveId, group] of byDriveId) {
    const newUrl = urlByDriveId.get(driveId);
    if (!newUrl) continue;
    for (const item of group) {
      const { error: updErr } = await supabase
        .from('menu_items')
        .update({ image_url: newUrl })
        .eq('id', item.id);
      if (updErr) {
        console.warn(`  FAIL update menu_items ${item.id}: ${updErr.message}`);
        continue;
      }
      updated++;
    }
  }
  console.log(`Updated ${updated} menu_items rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
