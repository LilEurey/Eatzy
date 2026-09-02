// Recommended For You — per-user content-based ranking via TF-IDF + cosine,
// same family as recommend-similar. Cold-start User Vector: real order
// history doesn't exist yet, so the "taste profile" is built from
// user_preferences (liked_cuisines, favorite_categories) set at onboarding
// instead of order history — swap in once real orders accumulate.
//
// Auth required: reads the caller's own user_preferences row (RLS-scoped).
// Anonymous or preference-less callers get an empty result, not an error,
// so the home screen can just hide the section.
//
// Deploy: supabase functions deploy recommend-for-you

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const TOP_K = 5;

type MenuItemRow = {
  id: string;
  name: string;
  name_th: string | null;
  price: number;
  image_url: string | null;
  ingredients: string[] | null;
  tags: string[] | null;
  category: string | null;
  allergens: string[] | null;
  is_halal: boolean;
  is_vegetarian: boolean;
  is_jay: boolean;
  vendor_id: string;
  vendors: { name: string } | null;
};

type UserPreferences = {
  is_halal: boolean;
  is_vegetarian: boolean;
  is_jay: boolean;
  spice_level: number;
  budget_max: number | null;
  allergies: string[];
  liked_cuisines: string[];
  favorite_categories: string[];
};

// Same fields as ml/recommend.py's build_food_vectors(): ingredients + tags + category.
function itemDoc(item: MenuItemRow): string {
  return [...(item.ingredients ?? []), ...(item.tags ?? []), item.category ?? '']
    .join(' ')
    .toLowerCase();
}

// Cold-start substitute for a real order-history User Vector: the taste
// signals collected at onboarding, in the same vocabulary as item docs.
function preferenceDoc(prefs: UserPreferences): string {
  return [...prefs.liked_cuisines, ...prefs.favorite_categories].join(' ').toLowerCase();
}

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

// Hard filters — is_halal/is_vegetarian/is_jay/budget are "don't rank this
// at all" rules. Allergies are NOT a hard filter here anymore: they're a
// warn-before-add risk (the Add to Cart confirm in item/[id].tsx), not a
// hide-from-recommendations rule, so a matching item can still surface —
// same policy the home feed and search use.
function passesHardFilters(item: MenuItemRow, prefs: UserPreferences): boolean {
  if (prefs.budget_max != null && item.price > prefs.budget_max) return false;
  if (prefs.is_halal && !item.is_halal) return false;
  if (prefs.is_vegetarian && !item.is_vegetarian) return false;
  if (prefs.is_jay && !item.is_jay) return false;
  return true;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ results: [] }); // not signed in — nothing personal to rank on

  const { data: prefsRow } = await supabase
    .from('user_preferences')
    .select('is_halal,is_vegetarian,is_jay,spice_level,budget_max,allergies,liked_cuisines,favorite_categories')
    .eq('user_id', user.id)
    .maybeSingle();

  const prefs: UserPreferences = prefsRow ?? {
    is_halal: false, is_vegetarian: false, is_jay: false, spice_level: 2,
    budget_max: null, allergies: [], liked_cuisines: [], favorite_categories: [],
  };

  const doc = preferenceDoc(prefs);
  if (!doc) return json({ results: [] }); // no taste signal yet (fresh account) — nothing to personalize on

  const { data: items, error } = await supabase
    .from('menu_items')
    .select('id,name,name_th,price,image_url,ingredients,tags,category,allergens,is_halal,is_vegetarian,is_jay,vendor_id,vendors(name)')
    .eq('is_available', true);

  if (error) return json({ error: error.message }, 500);

  const catalog = ((items ?? []) as unknown as MenuItemRow[]).filter((i) => passesHardFilters(i, prefs));
  if (catalog.length === 0) return json({ results: [] });

  const vectors = buildTfidfVectors([...catalog.map(itemDoc), doc]);
  const userVec = vectors[vectors.length - 1];

  const scored = catalog
    .map((item, i) => ({ item, score: cosineSimilarity(userVec, vectors[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  return json({
    results: scored.map(({ item, score }) => ({
      id: item.id,
      name: item.name,
      name_th: item.name_th,
      price: item.price,
      image_url: item.image_url,
      vendor_name: item.vendors?.name ?? '',
      score,
    })),
  });
});
