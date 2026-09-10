// Shared content-based ranking math for recommend-for-you and
// recommend-similar. Kept dependency-free (no Deno / no supabase-js) so it
// can be unit-tested under plain ts-jest — see supabase/functions/__tests__.
//
// This is a straight port of ml/recommend.py's build_food_vectors() /
// cosine ranking: plain TF-IDF with sklearn's default smoothing, then
// cosine similarity. Catalog is capstone-scale, so no external library.

/** The item fields that feed the TF-IDF document — ingredients + tags + category. */
export type DocFields = {
  ingredients: string[] | null;
  tags: string[] | null;
  category: string | null;
};

/** One text document per item: ingredients + tags + category, lowercased. */
export function itemDoc(item: DocFields): string {
  return [...(item.ingredients ?? []), ...(item.tags ?? []), item.category ?? '']
    .join(' ')
    .toLowerCase();
}

// sklearn's default token_pattern, `(?u)\b\w\w+\b`: runs of 2+ word
// characters, everything else (punctuation, single letters) dropped.
// Splitting on whitespace instead — which is what this did first — kept the
// punctuation glued on, and menu_items.category is full of it: the catalog's
// most common category, 'Main Dishes (Rice)', tokenized to `(rice)`, which
// never matched the bare `rice` sitting in 150 items' ingredients. Verified
// against sklearn: with this pattern the cosines agree to 6 decimal places,
// with the whitespace split they didn't (0.35657 vs 0.402956).
const TOKEN_PATTERN = /[\p{L}\p{N}_]{2,}/gu;

export function tokenize(doc: string): string[] {
  return doc.match(TOKEN_PATTERN) ?? [];
}

export function buildTfidfVectors(docs: string[]): Map<string, number>[] {
  const tokenized = docs.map(tokenize);
  const df = new Map<string, number>();
  for (const tokens of tokenized) {
    for (const term of new Set(tokens)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const n = docs.length;
  return tokenized.map((tokens) => {
    const tf = new Map<string, number>();
    for (const term of tokens) tf.set(term, (tf.get(term) ?? 0) + 1);
    const vec = new Map<string, number>();
    for (const [term, count] of tf) {
      const idf = Math.log((1 + n) / (1 + (df.get(term) ?? 0))) + 1;
      vec.set(term, count * idf);
    }
    return vec;
  });
}

export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [term, weight] of a) {
    const other = b.get(term);
    if (other) dot += weight * other;
  }
  const normA = Math.sqrt([...a.values()].reduce((s, w) => s + w * w, 0));
  const normB = Math.sqrt([...b.values()].reduce((s, w) => s + w * w, 0));
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}
