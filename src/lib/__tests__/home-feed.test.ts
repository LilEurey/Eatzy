import { DRINK_CATEGORY_FILTER, getTimeBasedCategories, restoreRank } from '@/lib/home-feed';
import { isDrinkCategory } from '@/lib/menu-categories';
import type { MealSegment } from '@/lib/time';

describe('getTimeBasedCategories', () => {
  // Home strips drinks from the Time-Based section, so a drink category here
  // silently empties it — that's what broke breakfast before.
  it.each(['breakfast', 'lunch', 'dinner'] as MealSegment[])('%s names no drink category', segment => {
    const cats = getTimeBasedCategories(segment);
    expect(cats.length).toBeGreaterThan(0);
    expect(cats.filter(isDrinkCategory)).toEqual([]);
  });
});

describe('DRINK_CATEGORY_FILTER', () => {
  it('matches every drink category, case-insensitively, from the single source list', () => {
    expect(DRINK_CATEGORY_FILTER).toBe('category.ilike.beverages,category.ilike.drinks');
  });
});

describe('restoreRank', () => {
  const row = (id: string) => ({ id });

  it('restores the RPC order', () => {
    expect(restoreRank(['c', 'a', 'b'], [row('a'), row('b'), row('c')]).map(r => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts rows the RPC did not rank last, not first', () => {
    expect(restoreRank(['b', 'a'], [row('x'), row('a'), row('b')]).map(r => r.id)).toEqual(['b', 'a', 'x']);
  });

  it('does not mutate its input', () => {
    const rows = [row('a'), row('b')];
    restoreRank(['b', 'a'], rows);
    expect(rows.map(r => r.id)).toEqual(['a', 'b']);
  });
});
