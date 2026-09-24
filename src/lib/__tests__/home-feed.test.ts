import {
  __queueResults,
  __setNextRpcResult,
  __setAuthUser,
  __resetMock,
  __getFromCalls,
} from './__mocks__/supabase';
import { invokeEdgeFunction } from '@/lib/edge-function';
import { DRINK_CATEGORY_FILTER, getTimeBasedCategories, restoreRank, loadHomeFeed } from '@/lib/home-feed';
import { isDrinkCategory } from '@/lib/menu-categories';
import type { Preferences } from '@/hooks/usePreferences';
import type { MealSegment } from '@/lib/time';
import type { MenuItem } from '@/components/home/sections';

jest.mock('@/lib/edge-function', () => ({ invokeEdgeFunction: jest.fn() }));

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

describe('loadHomeFeed', () => {
  // 2026-06-15T05:00:00Z is 12:00 in Bangkok — lunch.
  const NOW = new Date('2026-06-15T05:00:00Z');
  const PREFS: Preferences = { is_halal: false, is_vegetarian: true, is_jay: false, allergies: [] };

  const menuItem = (over: Partial<MenuItem>): MenuItem => ({
    id: 'x', name: 'x', name_th: null, price: 50, category: 'Noodles', image_url: null,
    vendor_id: 'v1', vendors: { name: 'Stall' }, is_halal: false, is_vegetarian: true, is_jay: false,
    allergens: null,
    ...over,
  });

  beforeEach(() => {
    __resetMock();
    // Anonymous — skips the profile and Because You Ordered queries, so
    // every test only needs to queue the food-section fetches it cares about.
    __setAuthUser(null);
    __setNextRpcResult({ data: [] });
    (invokeEdgeFunction as jest.Mock).mockResolvedValue({ data: { results: [] }, error: null });
  });

  it('excludes a vegetarian-violating item and a drink category from the food sections, but keeps the drink in Drinks', async () => {
    const vegOk = menuItem({ id: 'm1', is_vegetarian: true });
    const vegViolate = menuItem({ id: 'm2', is_vegetarian: false });
    const drink = menuItem({ id: 'm3', category: 'Beverages', is_vegetarian: true });

    __queueResults(
      { data: [] },                          // vendors
      { data: [] },                          // featured
      { data: [vegOk, vegViolate, drink] },  // latestRelease
      { data: [vegOk, vegViolate, drink] },  // timeBased
      { data: [drink] },                     // drinks
    );

    const result = await loadHomeFeed(PREFS, NOW);

    expect(result.latestRelease.map(i => i.id)).toEqual(['m1']);
    expect(result.timeBasedItems.map(i => i.id)).toEqual(['m1']);
    expect(result.drinks.map(i => i.id)).toEqual(['m3']);
  });

  it('filters the limited menu_items queries by the hard dietary flags in SQL, not just after .limit(10)', async () => {
    await loadHomeFeed(PREFS, NOW);

    const menuQueries = __getFromCalls().filter(c => c.table === 'menu_items');
    // featured, latestRelease, timeBased, drinks
    expect(menuQueries).toHaveLength(4);
    for (const q of menuQueries) {
      expect(q.filters).toContainEqual(['is_vegetarian', true]);
      expect(q.filters).not.toContainEqual(['is_halal', true]);
    }
  });

  it('restores the trending RPC rank order and keeps only the top 2', async () => {
    __setNextRpcResult({ data: [{ menu_item_id: 'm2' }, { menu_item_id: 'm1' }, { menu_item_id: 'm3' }] });
    const m1 = menuItem({ id: 'm1' });
    const m2 = menuItem({ id: 'm2' });
    const m3 = menuItem({ id: 'm3' });

    __queueResults(
      { data: [] },           // vendors
      { data: [] },           // featured
      { data: [] },           // latestRelease
      { data: [] },           // timeBased
      { data: [] },           // drinks
      { data: [m1, m3, m2] }, // trending rows, back in a different order than the RPC rank
    );

    const result = await loadHomeFeed(PREFS, NOW);

    expect(result.trending.map(i => i.id)).toEqual(['m2', 'm1']);
  });

  it('clears every section — including similarToFeatured — on a failed load, not just some of them', async () => {
    // The bug this extraction fixes: the old loadData() catch cleared 8
    // pieces of state and missed similarToFeatured, leaving stale rows on
    // screen after a failed load. loadHomeFeed can no longer do that partial
    // job — a throw anywhere in the fetch resolves to one fully-empty result.
    (invokeEdgeFunction as jest.Mock).mockImplementation(() => { throw new Error('network down'); });

    const result = await loadHomeFeed(PREFS, NOW);

    expect(result).toEqual({
      profile: null,
      mealSegment: 'lunch',
      allVendors: [],
      featured: null,
      trending: [],
      latestRelease: [],
      drinks: [],
      recommendedForYou: [],
      becauseYouOrdered: [],
      timeBasedItems: [],
      similarToFeatured: [],
    });
  });
});
