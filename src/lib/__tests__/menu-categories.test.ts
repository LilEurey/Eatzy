import { isDrinkCategory, getTopMenuCategories } from '@/lib/menu-categories';
import { __setNextResult } from '@/lib/__tests__/__mocks__/supabase';

describe('isDrinkCategory', () => {
  it('matches "Beverages" and "Drinks" case-insensitively', () => {
    expect(isDrinkCategory('Beverages')).toBe(true);
    expect(isDrinkCategory('drinks')).toBe(true);
    expect(isDrinkCategory('DRINKS')).toBe(true);
  });

  it('is false for food categories and for null', () => {
    expect(isDrinkCategory('Noodles')).toBe(false);
    expect(isDrinkCategory(null)).toBe(false);
  });
});

describe('getTopMenuCategories', () => {
  it('ranks the DB category strings by frequency, most common first', async () => {
    __setNextResult({
      data: [
        { category: 'Noodles' }, { category: 'Noodles' }, { category: 'Noodles' },
        { category: 'Curry' }, { category: 'Curry' },
        { category: 'Soup' },
        { category: null },
      ],
    });
    expect(await getTopMenuCategories(2)).toEqual(['Noodles', 'Curry']);
  });

  it('returns the static fallback list when the query errors', async () => {
    __setNextResult({ error: { message: 'boom' } });
    const out = await getTopMenuCategories(3);
    expect(out).toEqual(['Main Dishes (Rice)', 'Beverages', 'Noodles']);
  });

  // Regression: the fallback used to be hand-invented ('Rice Dishes', 'Curry',
  // 'Salads', ...), overlapping the real catalog on 'Noodles' alone. Those
  // strings reach menu_items.category via the vendor add-item picker and the
  // User Vector via the preferences picker, where anything outside the
  // catalog's vocabulary matches nothing and silently disappears from home.
  it('falls back only to categories the real catalog actually uses', async () => {
    const CATALOG = ['Main Dishes (Rice)', 'Beverages', 'Noodles', 'Appetizers', 'Main Dishes', 'Add-ons', 'Desserts'];
    __setNextResult({ error: { message: 'boom' } });
    for (const category of await getTopMenuCategories(20)) {
      expect(CATALOG).toContain(category);
    }
  });

  it('returns the static fallback list when the catalog is empty', async () => {
    __setNextResult({ data: [] });
    const out = await getTopMenuCategories(4);
    expect(out).toHaveLength(4);
  });
});
