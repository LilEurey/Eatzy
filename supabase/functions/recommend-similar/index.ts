// Similar Foods — content-based recommendation via TF-IDF + cosine similarity.
// TS port of build_food_vectors()/similar_foods() in ml/recommend.py, run
// server-side against the live menu_items catalog instead of CSV fixtures.
// Read-only public catalog data — no auth gating needed.
//
// Deploy: supabase functions deploy recommend-similar

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { buildTfidfVectors, cosineSimilarity, itemDoc } from '../_shared/tfidf.ts';
import { getRankingCatalog } from '../_shared/catalog.ts';

const TOP_K = 5;

type MenuItemRow = {
  id: string;
  name: string;
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
};

// Same hard filters recommend-for-you applies — a halal/vegetarian/jay
// caller must not see a violating item surface as "similar", even when the
// anchor item itself is something they can eat. Allergies are deliberately
// NOT filtered here: they're a warn-before-add risk (the Add to Cart
// confirm in item/[id].tsx), not a hide-from-recommendations rule.
function passesHardFilters(item: MenuItemRow, prefs: UserPreferences): boolean {
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

  let body: { item_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.item_id) return json({ error: 'item_id is required' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Best-effort: an anonymous caller (or one with no saved preferences yet)
  // just gets the unfiltered ranking, same cold-start behavior as
  // recommend-for-you.
  const { data: { user } } = await supabase.auth.getUser();
  const { data: prefsRow } = user
    ? await supabase.from('user_preferences').select('is_halal,is_vegetarian,is_jay').eq('user_id', user.id).maybeSingle()
    : { data: null };
  const prefs: UserPreferences = prefsRow ?? { is_halal: false, is_vegetarian: false, is_jay: false };

  const { rows: catalog, error } = await getRankingCatalog<MenuItemRow>(supabase);
  if (error) return json({ error }, 500);

  const targetIndex = catalog.findIndex((i) => i.id === body.item_id);
  if (targetIndex === -1) return json({ error: 'item not found or unavailable' }, 404);

  // TF-IDF vectors computed over the full catalog (so IDF weights aren't
  // skewed by dropping items first) — the dietary filter only trims which
  // *results* can surface. recommend-for-you now fits in this same order.
  const vectors = buildTfidfVectors(catalog.map(itemDoc));
  const targetVec = vectors[targetIndex];

  const scored = catalog
    .map((item, i) => ({ item, score: cosineSimilarity(targetVec, vectors[i]) }))
    .filter((_, i) => i !== targetIndex)
    .filter(({ item }) => passesHardFilters(item, prefs))
    // id breaks score ties so repeat requests return the same five items.
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, TOP_K);

  // Same best-effort served-set log recommend-for-you writes. Only for a
  // signed-in caller: recommendation_log.user_id is NOT NULL and its RLS
  // insert policy is `auth.uid() = user_id`, so an anonymous browse logs
  // nothing rather than failing.
  if (user && scored.length > 0) {
    await supabase.from('recommendation_log').insert({
      user_id: user.id,
      row_type: 'similar_foods',
      recommendation_type: 'content_tfidf_cosine',
      item_ids: scored.map(({ item }) => item.id),
      match_score: Number(scored[0].score.toFixed(4)),
    });
  }

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
