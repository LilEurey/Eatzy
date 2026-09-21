import { rankForPreferences, rankSimilar, TOP_K, type RankableItem } from '../_shared/ranking';

const item = (id: string, over: Partial<RankableItem> = {}): RankableItem => ({
  id, price: 50, is_halal: false, is_vegetarian: false, is_jay: false,
  ingredients: [], tags: [], category: 'Main Dishes (Rice)',
  ...over,
});

const NO_DIET = { is_halal: false, is_vegetarian: false, is_jay: false, budget_max: null };

const CATALOG: RankableItem[] = [
  item('a', { ingredients: ['pork', 'basil', 'rice'] }),
  item('b', { ingredients: ['chicken', 'rice'], is_halal: true }),
  item('c', { ingredients: ['pork', 'noodles'], category: 'Noodles' }),
  item('d', { ingredients: ['milk', 'tea', 'rice'], category: 'Drinks', is_halal: true }),
  item('e', { ingredients: ['tofu', 'rice'], is_halal: true, is_vegetarian: true, price: 100 }),
];

const ids = (r: { item: RankableItem }[] | null) => (r ?? []).map(x => x.item.id);

describe('rankForPreferences', () => {
  it('gives the same dish the same score whatever the caller\'s dietary settings', () => {
    // Fitting IDF over the filtered catalog would make these differ.
    const open = rankForPreferences(CATALOG, 'rice', NO_DIET);
    const halal = rankForPreferences(CATALOG, 'rice', { ...NO_DIET, is_halal: true });
    const score = (r: typeof open, id: string) => r.find(x => x.item.id === id)!.score;

    expect(ids(halal)).not.toContain('a');           // filtered out for the halal caller...
    expect(score(halal, 'b')).toBe(score(open, 'b')); // ...but b scores identically
    expect(score(halal, 'e')).toBe(score(open, 'e'));
  });

  it('never surfaces drinks', () => {
    expect(ids(rankForPreferences(CATALOG, 'milk tea drinks', NO_DIET))).not.toContain('d');
  });

  it('applies the budget and dietary hard filters', () => {
    expect(ids(rankForPreferences(CATALOG, 'rice', { ...NO_DIET, budget_max: 60 }))).not.toContain('e');
    expect(ids(rankForPreferences(CATALOG, 'rice', { ...NO_DIET, is_vegetarian: true }))).toEqual(['e']);
  });

  it('breaks score ties by id, independent of the order rows arrive in', () => {
    // No token overlap -> every item scores 0 -> order is decided by the tie-break alone.
    const forward = ids(rankForPreferences(CATALOG, 'zzzzz', NO_DIET));
    const reversed = ids(rankForPreferences([...CATALOG].reverse(), 'zzzzz', NO_DIET));
    expect(forward).toEqual(['a', 'b', 'c', 'e']);
    expect(reversed).toEqual(forward);
  });

  it(`returns at most ${TOP_K}`, () => {
    const many = Array.from({ length: 9 }, (_, i) => item(`i${i}`));
    expect(rankForPreferences(many, 'rice', NO_DIET)).toHaveLength(TOP_K);
  });
});

describe('rankSimilar', () => {
  const OPEN = { is_halal: false, is_vegetarian: false, is_jay: false };

  it('excludes the anchor and returns null when it is not in the catalog', () => {
    expect(ids(rankSimilar(CATALOG, 'a', OPEN))).not.toContain('a');
    expect(rankSimilar(CATALOG, 'nope', OPEN)).toBeNull();
  });

  it('orders results by descending score', () => {
    const scores = (rankSimilar(CATALOG, 'a', OPEN) ?? []).map(x => x.score);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
  });

  it('applies the dietary filter but not the drink or budget filters', () => {
    expect(ids(rankSimilar(CATALOG, 'a', { ...OPEN, is_halal: true })).sort()).toEqual(['b', 'd', 'e']);
    expect(ids(rankSimilar(CATALOG, 'a', OPEN))).toEqual(expect.arrayContaining(['d', 'e'])); // drink and price-100 item still surface
  });

  it('is deterministic under input reordering', () => {
    const forward = ids(rankSimilar(CATALOG, 'a', OPEN));
    expect(ids(rankSimilar([...CATALOG].reverse(), 'a', OPEN))).toEqual(forward);
  });
});
