// The ranking pipeline shared by recommend-for-you and recommend-similar:
// fit TF-IDF over the WHOLE catalog, filter, break ties by id, cut to top-K.
// Dependency-free (no Deno / supabase-js) so it's unit-tested under ts-jest
// like tfidf.ts — see supabase/functions/__tests__/ranking.test.ts.
//
// Rules this module owns (they used to be re-implemented per function, and
// one copy already drifted):
//  - Vectors are fitted over the whole catalog BEFORE filtering. Filtering
//    first makes every term's IDF depend on the caller's own dietary
//    settings, so two students can't be handed comparable scores for a dish.
//  - Every ranking has a deterministic tie-break (item id). Ties are the
//    norm at this scale — every zero-score item ties.
//  - Allergies are NOT a filter: they warn at Add to Cart, they never hide.

import { buildTfidfVectors, cosineSimilarity, itemDoc, type DocFields } from './tfidf.ts';

export const TOP_K = 5;

export type RankableItem = DocFields & {
  id: string;
  price: number;
  is_halal: boolean;
  is_vegetarian: boolean;
  is_jay: boolean;
};

export type Diet = { is_halal: boolean; is_vegetarian: boolean; is_jay: boolean };

export type Scored<T> = { item: T; score: number };

// Mirror of src/lib/menu-categories.ts's DRINK_CATEGORIES — an Edge Function
// can't import from src/, and menu_items.category is free text that seeds have
// written under both spellings. Keep the two lists in step.
const DRINK_CATEGORIES = ['beverages', 'drinks'];

export function isDrinkCategory(category: string | null): boolean {
  return !!category && DRINK_CATEGORIES.includes(category.toLowerCase());
}

function passesDiet(item: RankableItem, diet: Diet): boolean {
  if (diet.is_halal && !item.is_halal) return false;
  if (diet.is_vegetarian && !item.is_vegetarian) return false;
  if (diet.is_jay && !item.is_jay) return false;
  return true;
}

function rankAgainst<T extends RankableItem>(
  catalog: T[],
  vectors: Map<string, number>[],
  target: Map<string, number>,
  keep: (item: T, index: number) => boolean,
): Scored<T>[] {
  return catalog
    .map((item, i) => ({ item, score: cosineSimilarity(target, vectors[i]), i }))
    .filter(({ item, i }) => keep(item, i))
    // id breaks score ties, so an unchanged catalog always yields the same
    // top-K regardless of the order the rows arrived in.
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, TOP_K)
    .map(({ item, score }) => ({ item, score }));
}

/** "Recommended For You": rank the catalog against a taste-profile document.
 * Hard filters: diet, budget, and drinks (the feed has its own drinks row, and
 * a milk tea outranking every dish reads as a broken ranking). */
export function rankForPreferences<T extends RankableItem>(
  catalog: T[],
  preferenceDoc: string,
  prefs: Diet & { budget_max: number | null },
): Scored<T>[] {
  const vectors = buildTfidfVectors([...catalog.map(itemDoc), preferenceDoc]);
  const userVec = vectors[vectors.length - 1];
  return rankAgainst(catalog, vectors, userVec, item =>
    !isDrinkCategory(item.category)
    && (prefs.budget_max == null || item.price <= prefs.budget_max)
    && passesDiet(item, prefs));
}

/** "Similar Foods": rank the catalog against one anchor item, excluding the
 * anchor itself. Diet filter only — a halal/vegetarian/jay caller must not see
 * a violating item surface as "similar". Returns null when the anchor isn't in
 * the catalog (unknown or unavailable). */
export function rankSimilar<T extends RankableItem>(
  catalog: T[],
  itemId: string,
  diet: Diet,
): Scored<T>[] | null {
  const targetIndex = catalog.findIndex(i => i.id === itemId);
  if (targetIndex === -1) return null;
  const vectors = buildTfidfVectors(catalog.map(itemDoc));
  return rankAgainst(catalog, vectors, vectors[targetIndex], (item, i) =>
    i !== targetIndex && passesDiet(item, diet));
}
