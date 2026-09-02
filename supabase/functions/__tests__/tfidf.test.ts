import { itemDoc, buildTfidfVectors, cosineSimilarity } from '../_shared/tfidf';

describe('itemDoc', () => {
  it('joins ingredients + tags + category, lowercased', () => {
    expect(
      itemDoc({ ingredients: ['Pork', 'Basil'], tags: ['Spicy'], category: 'Rice Dishes' }),
    ).toBe('pork basil spicy rice dishes');
  });

  it('tolerates null array fields', () => {
    expect(itemDoc({ ingredients: null, tags: null, category: null })).toBe('');
    expect(itemDoc({ ingredients: ['rice'], tags: null, category: 'Rice' })).toBe('rice rice');
  });
});

describe('buildTfidfVectors', () => {
  it('returns one vector per document', () => {
    const vecs = buildTfidfVectors(['a b c', 'a b', 'a']);
    expect(vecs).toHaveLength(3);
  });

  it('weights a term shared by every doc lower than a rare term (smoothed idf)', () => {
    // "a" is in all 3 docs, "c" in 1 — within the same doc, c must outweigh a.
    const [v0] = buildTfidfVectors(['a c', 'a', 'a']);
    expect(v0.get('c')!).toBeGreaterThan(v0.get('a')!);
  });

  it('scales with term frequency inside a doc', () => {
    const [v0] = buildTfidfVectors(['x x y', 'y']);
    expect(v0.get('x')!).toBeGreaterThan(v0.get('y')!);
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    const [v] = buildTfidfVectors(['pork basil spicy']);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10);
  });

  it('is 0 when the vectors share no terms', () => {
    const [a, b] = buildTfidfVectors(['pork basil', 'tofu lettuce']);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('is 0 when either vector is empty', () => {
    const [a] = buildTfidfVectors(['pork']);
    expect(cosineSimilarity(a, new Map())).toBe(0);
  });

  it('ranks a closer document higher', () => {
    const docs = ['pork basil chili', 'pork basil rice', 'tofu salad lime'];
    const [target, near, far] = buildTfidfVectors(docs);
    expect(cosineSimilarity(target, near)).toBeGreaterThan(cosineSimilarity(target, far));
  });
});
