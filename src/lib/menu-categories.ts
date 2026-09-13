import { supabase } from '@/lib/supabase';

// Static fallback if the catalog query fails or the DB is empty. These are the
// real distinct menu_items.category values, most common first — NOT a
// hand-invented set. Both consumers write these strings into data that is
// later matched against the catalog: the preferences picker seeds
// recommend-for-you's cold-start User Vector (whose TF-IDF doc contains the
// literal category string), and the vendor add-item picker sets
// menu_items.category itself, which home's Time-Based sections filter on.
// An invented value like 'Rice Dishes' or 'Curry' saves fine and then matches
// nothing, so the fallback has to speak the catalog's vocabulary too.
export const FALLBACK_CATEGORIES = ['Main Dishes (Rice)', 'Beverages', 'Noodles', 'Appetizers', 'Main Dishes', 'Desserts', 'Add-ons'];

// menu_items.category is free text with no DB constraint, and different
// seeds/screens have written drinks under two different strings —
// 'Beverages' (main KMUTT seed) and 'Drinks' (vendor add-item screen, other
// seed data). Compare case-insensitively so home's food/drink split isn't
// tripped up by that inconsistency.
const DRINK_CATEGORIES = ['beverages', 'drinks'];

export function isDrinkCategory(category: string | null): boolean {
  return !!category && DRINK_CATEGORIES.includes(category.toLowerCase());
}

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
