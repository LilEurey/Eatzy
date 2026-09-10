import { itemDoc, tokenize, buildTfidfVectors, cosineSimilarity } from '../_shared/tfidf';

describe('tokenize', () => {
  it('strips punctuation so a parenthesised category matches a bare ingredient', () => {
    expect(tokenize('main dishes (rice)')).toEqual(['main', 'dishes', 'rice']);
  });

  it('drops single-character tokens, like sklearn\'s default token_pattern', () => {
    expect(tokenize('a pork b basil')).toEqual(['pork', 'basil']);
  });
});

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
    // "rice" is in all 3 docs, "truffle" in 1 — within the same doc, the rare
    // term must outweigh the common one.
    const [v0] = buildTfidfVectors(['rice truffle', 'rice', 'rice']);
    expect(v0.get('truffle')!).toBeGreaterThan(v0.get('rice')!);
  });

  it('scales with term frequency inside a doc', () => {
    const [v0] = buildTfidfVectors(['pork pork basil', 'basil']);
    expect(v0.get('pork')!).toBeGreaterThan(v0.get('basil')!);
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

  // Guards the "straight port of ml/recommend.py" claim in _shared/tfidf.ts.
  // Expected values come from sklearn itself:
  //   TfidfVectorizer().fit_transform(docs); cosine_similarity(m[0], m)
  // Punctuation and the stray single-char token are the whole point — that's
  // what the old whitespace tokenizer got wrong.
  it('matches sklearn TfidfVectorizer to 6 decimal places', () => {
    const docs = [
      'pork basil chili (rice) a',
      'pork basil rice',
      'tofu salad lime',
      'beef noodle soup a',
    ];
    const v = buildTfidfVectors(docs);
    const cosines = v.map((x) => Number(cosineSimilarity(v[0], x).toFixed(6)));
    expect(cosines).toEqual([1, 0.806804, 0, 0]);
  });

  it('ranks a closer document higher', () => {
    const docs = ['pork basil chili', 'pork basil rice', 'tofu salad lime'];
    const [target, near, far] = buildTfidfVectors(docs);
    expect(cosineSimilarity(target, near)).toBeGreaterThan(cosineSimilarity(target, far));
  });
});
