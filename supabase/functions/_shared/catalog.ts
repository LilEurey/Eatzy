import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// recommend-for-you and recommend-similar both rank over the exact same set:
// every available menu item plus its vendor name. menu_items and vendors are
// both `for select using (true)` (fully public read — identical rows for
// every caller), so a short process-wide cache is safe and skips a ~500-row
// fetch + JSON parse on each warm invocation. Stale by at most TTL_MS.
const TTL_MS = 30_000;

const SELECT =
  'id,name,name_th,price,image_url,ingredients,tags,category,allergens,is_halal,is_vegetarian,is_jay,vendor_id,vendors(name)';

let cache: { rows: unknown[]; at: number } | null = null;

// Mirror of src/lib/menu-categories.ts's DRINK_CATEGORIES — an Edge Function
// can't import from src/, and menu_items.category is free text that seeds have
// written under both spellings. Keep the two lists in step.
const DRINK_CATEGORIES = ['beverages', 'drinks'];

export function isDrinkCategory(category: string | null): boolean {
  return !!category && DRINK_CATEGORIES.includes(category.toLowerCase());
}

export async function getRankingCatalog<T>(
  client: SupabaseClient,
): Promise<{ rows: T[]; error: string | null }> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { rows: cache.rows as T[], error: null };
  }
  // order('id'): Postgres makes no promise about row order without ORDER BY,
  // and both callers finish with a sort whose ties fall back to catalog order
  // (Array.prototype.sort is stable). Without a fixed order the same student
  // could get a different top-5 on two identical requests.
  const { data, error } = await client
    .from('menu_items')
    .select(SELECT)
    .eq('is_available', true)
    .order('id', { ascending: true });
  if (error) return { rows: [], error: error.message };
  cache = { rows: data ?? [], at: Date.now() };
  return { rows: (data ?? []) as T[], error: null };
}
