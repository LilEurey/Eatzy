import { supabase } from '@/lib/supabase';

// Static fallback if the catalog query fails or the DB is empty — a
// reasonable default set for a Thai campus food court.
const FALLBACK_CATEGORIES = ['Noodles', 'Rice Dishes', 'Curry', 'Soup', 'Salads', 'Desserts', 'Drinks', 'Appetizers'];

// Real distinct menu_items.category values, most common first. Used as the
// "Favorite Categories" picker options in onboarding / edit-preferences —
// these directly feed recommend-for-you's cold-start User Vector (see
// CLAUDE.md's User Vector approach), whose TF-IDF doc includes each item's
// literal category string. Returning the exact DB strings (not a hand-typed
// list) keeps that vocabulary aligned so cosine similarity actually has
// overlap to find.
export async function getTopMenuCategories(limit = 8): Promise<string[]> {
  const { data, error } = await supabase.from('menu_items').select('category').eq('is_available', true);
  if (error || !data?.length) return FALLBACK_CATEGORIES.slice(0, limit);

  const counts = new Map<string, number>();
  for (const row of data) {
    if (!row.category) continue;
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([category]) => category);
  return ranked.length ? ranked.slice(0, limit) : FALLBACK_CATEGORIES.slice(0, limit);
}
