import {
  __queueResults,
  __setNextRpcResult,
  __setAuthUser,
  __resetMock,
  __getFromCalls,
  supabase,
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
    jest.spyOn(supabase.auth, 'getUser').mockRejectedValueOnce(new Error('network down'));
    // The edge function itself still answers — a failed load must not hand
    // its rows back next to an otherwise empty feed.
    (invokeEdgeFunction as jest.Mock).mockResolvedValue({ data: { results: [{ id: 'r1' }] }, error: null });

    const { recommendedForYou, similarToFeatured, ...sections } = await loadHomeFeed(PREFS, NOW);

    expect(sections).toEqual({
      profile: null,
      mealSegment: 'lunch',
      allVendors: [],
      featured: null,
      trending: [],
      latestRelease: [],
      drinks: [],
      becauseYouOrdered: [],
      timeBasedItems: [],
    });
    expect(await recommendedForYou).toEqual([]);
    expect(await similarToFeatured).toEqual([]);
  });

  it('resolves the feed without waiting on the recommendation edge functions', async () => {
    // The whole point of handing these two rows back as promises: each call
    // takes 0.7–1.8s, and awaiting them held home on its skeleton for 3–4s.
    const answer: { [name: string]: (v: unknown) => void } = {};
    (invokeEdgeFunction as jest.Mock).mockImplementation((name: string) => new Promise(resolve => { answer[name] = resolve; }));
    const promoted = menuItem({ id: 'm1' });
    __queueResults({ data: [] }, { data: [promoted] }); // vendors, featured

    // Would hang here (and time the test out) if the feed awaited either call.
    const result = await loadHomeFeed(PREFS, NOW);

    expect(result.featured?.id).toBe('m1');
    expect(invokeEdgeFunction).toHaveBeenCalledWith('recommend-similar', { body: { item_id: 'm1' } });

    answer['recommend-for-you']({ data: { results: [{ id: 'r1' }] }, error: null });
    answer['recommend-similar']({ data: { results: [{ id: 's1' }] }, error: null });
    expect(await result.recommendedForYou).toEqual([{ id: 'r1' }]);
    expect(await result.similarToFeatured).toEqual([{ id: 's1' }]);
  });

  it('keeps the feed and empties just the row when a recommendation call fails', async () => {
    (invokeEdgeFunction as jest.Mock).mockRejectedValue(new Error('edge function down'));
    const dish = menuItem({ id: 'm1' });
    __queueResults({ data: [] }, { data: [dish] }, { data: [dish] }); // vendors, featured, latestRelease

    const result = await loadHomeFeed(PREFS, NOW);

    expect(result.latestRelease.map(i => i.id)).toEqual(['m1']);
    expect(await result.recommendedForYou).toEqual([]);
    expect(await result.similarToFeatured).toEqual([]);
  });
});
