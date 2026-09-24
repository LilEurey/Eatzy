// Similar Foods — content-based recommendation via TF-IDF + cosine similarity.
// TS port of build_food_vectors()/similar_foods() in ml/recommend.py, run
// server-side against the live menu_items catalog instead of CSV fixtures.
// Read-only public catalog data — no auth gating needed.
//
// Deploy: supabase functions deploy recommend-similar

import { callerClient, corsAndJson } from '../_shared/http.ts';
import { getRankingCatalog } from '../_shared/catalog.ts';
import { callerDietFrom, rankSimilar } from '../_shared/ranking.ts';

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

Deno.serve(async (req) => {
  const { cors, json } = corsAndJson(req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  let body: { item_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.item_id) return json({ error: 'item_id is required' }, 400);

  const supabase = callerClient(req.headers.get('Authorization') ?? '');

  // Anonymous or no saved row: unfiltered ranking (nothing to filter on). A
  // FAILED prefs read is not "no restrictions" — fail closed rather than show
  // a halal/vegetarian/jay student dishes they can't eat.
  const { data: { user } } = await supabase.auth.getUser();
  const diet = callerDietFrom<UserPreferences>(
    user?.id ?? null,
    user
      ? await supabase.from('user_preferences').select('is_halal,is_vegetarian,is_jay').eq('user_id', user.id).maybeSingle()
      : { data: null, error: null },
  );
  if (diet.kind === 'error') return json({ error: diet.message }, 500);
  const prefs: UserPreferences = diet.kind === 'saved' ? diet.prefs : { is_halal: false, is_vegetarian: false, is_jay: false };

  const { rows: catalog, error } = await getRankingCatalog<MenuItemRow>(supabase);
  if (error) return json({ error }, 500);

  // Fit-over-whole-catalog, diet filter, id tie-break and top-K all live in
  // _shared/ranking.ts (shared with recommend-for-you, and unit-tested).
  const scored = rankSimilar(catalog, body.item_id, prefs);
  if (!scored) return json({ error: 'item not found or unavailable' }, 404);

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
