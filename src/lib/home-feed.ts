import { DRINK_CATEGORIES } from '@/lib/menu-categories';
import type { MealSegment } from '@/lib/time';

// Pure pieces of the student home feed, kept out of the screen so the rules
// that only used to live in comments are unit-tested (see
// __tests__/home-feed.test.ts).

// Time-Based — menu_items.available_time_segment is 'all' on every seeded
// row (a KMUTT stall's menu doesn't actually change by clock hour), so
// filtering on that column would just return the full catalog. Category is
// the real signal for "what fits this meal" instead.
//
// Breakfast used to be ['Beverages', 'Desserts', 'Add-ons'], which collapsed
// to almost nothing: the drink filter applied to this section strips
// 'Beverages', by far the biggest of the three, leaving ~6 desserts and a
// pile of add-ons that aren't meals. These are the categories a Thai campus
// stall actually serves in the morning, and none of them is a drink — a drink
// category here silently empties the section, because home strips drinks from
// it.
const BREAKFAST_CATEGORIES = ['Noodles', 'Soup', 'Appetizers', 'Main Dishes (Rice)'];
const LUNCH_CATEGORIES = ['Main Dishes (Rice)', 'Noodles', 'Main Dishes', 'Appetizers'];
const DINNER_CATEGORIES = ['Main Dishes (Rice)', 'Noodles', 'Main Dishes'];

export function getTimeBasedCategories(segment: MealSegment): string[] {
  if (segment === 'breakfast') return BREAKFAST_CATEGORIES;
  if (segment === 'lunch') return LUNCH_CATEGORIES;
  return DINNER_CATEGORIES;
}

/** PostgREST `.or()` filter matching every drink category (case-insensitive),
 * derived from the one DRINK_CATEGORIES list so it can't drift from
 * isDrinkCategory(). */
export const DRINK_CATEGORY_FILTER = DRINK_CATEGORIES.map(c => `category.ilike.${c}`).join(',');

/** Trending and Because You Ordered come back from their RPCs as ranked id
 * lists, then a follow-up fetch returns the rows in arbitrary order. Restore
 * the RPC order; anything the RPC didn't rank sorts last, not first (`?? 0`
 * used to promote an unranked row to the top of a "most ordered" list). */
export function restoreRank<T extends { id: string }>(rankedIds: string[], rows: T[]): T[] {
  const rank = new Map(rankedIds.map((id, i) => [id, i]));
  const at = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
  return rows.slice().sort((a, b) => at(a.id) - at(b.id));
}
