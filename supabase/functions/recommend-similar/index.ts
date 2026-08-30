// Similar Foods — content-based recommendation via TF-IDF + cosine similarity.
// TS port of build_food_vectors()/similar_foods() in ml/recommend.py, run
// server-side against the live menu_items catalog instead of CSV fixtures.
// Read-only public catalog data — no auth gating needed.
//
// Deploy: supabase functions deploy recommend-similar

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TOP_K = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type MenuItemRow = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  ingredients: string[] | null;
  tags: string[] | null;
  category: string | null;
  vendor_id: string;
  vendors: { name: string } | null;
};

// One text document per item: ingredients + tags + category, same fields
// ml/recommend.py's build_food_vectors() uses.
function toDoc(item: MenuItemRow): string {
  return [...(item.ingredients ?? []), ...(item.tags ?? []), item.category ?? '']
    .join(' ')
    .toLowerCase();
}

// Plain TF-IDF: term frequency per doc, weighted by inverse document
// frequency across the catalog. No external library — catalog is small
// (capstone scale), and this keeps the math identical to sklearn's default.
function buildTfidfVectors(docs: string[]): Map<string, number>[] {
  const tokenized = docs.map((d) => d.split(/\s+/).filter(Boolean));
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

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: { item_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.item_id) return json({ error: 'item_id is required' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(supabaseUrl, anonKey);

  const { data: items, error } = await supabase
    .from('menu_items')
    .select('id,name,price,image_url,ingredients,tags,category,vendor_id,vendors(name)')
    .eq('is_available', true);

  if (error) return json({ error: error.message }, 500);

  const catalog = (items ?? []) as unknown as MenuItemRow[];
  const targetIndex = catalog.findIndex((i) => i.id === body.item_id);
  if (targetIndex === -1) return json({ error: 'item not found or unavailable' }, 404);

  const vectors = buildTfidfVectors(catalog.map(toDoc));
  const targetVec = vectors[targetIndex];

  const scored = catalog
    .map((item, i) => ({ item, score: cosineSimilarity(targetVec, vectors[i]) }))
    .filter((_, i) => i !== targetIndex)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  return json({
    results: scored.map(({ item, score }) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      image_url: item.image_url,
      vendor_name: item.vendors?.name ?? '',
      score,
    })),
  });
});
