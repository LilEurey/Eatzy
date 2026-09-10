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
import { buildTfidfVectors, cosineSimilarity, itemDoc } from '../_shared/tfidf.ts';
import { getRankingCatalog, isDrinkCategory } from '../_shared/catalog.ts';

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
  budget_max: number | null;
  liked_cuisines: string[];
  favorite_categories: string[];
};

// Cold-start substitute for a real order-history User Vector: the taste
// signals collected at onboarding, in the same vocabulary as item docs
// (getTopMenuCategories() feeds the picker the literal category strings).
//
// liked_cuisines is in here for the day a cuisine picker exists — no screen
// writes that column today (onboarding.tsx and edit-preferences.tsx both save
// favorite_categories only), so for a real signed-up student this doc is the
// favourite categories alone. Harmless to keep: an empty array contributes
// nothing, and the demo seed does populate it.
function preferenceDoc(prefs: UserPreferences): string {
  return [...prefs.liked_cuisines, ...prefs.favorite_categories].join(' ').toLowerCase();
}

// Hard filters — is_halal/is_vegetarian/is_jay/budget are "don't rank this
// at all" rules. Allergies are NOT a hard filter here anymore: they're a
// warn-before-add risk (the Add to Cart confirm in item/[id].tsx), not a
// hide-from-recommendations rule, so a matching item can still surface —
// same policy the home feed and search use.
//
// Drinks are excluded for the same reason every other home section excludes
// them: the feed has its own "Drinks You Might Like" row, and a milk tea
// outranking every dish in "Recommended For You" reads as a broken ranking.
function passesHardFilters(item: MenuItemRow, prefs: UserPreferences): boolean {
  if (isDrinkCategory(item.category)) return false;
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
    .select('is_halal,is_vegetarian,is_jay,budget_max,liked_cuisines,favorite_categories')
    .eq('user_id', user.id)
    .maybeSingle();

  const prefs: UserPreferences = prefsRow ?? {
    is_halal: false, is_vegetarian: false, is_jay: false,
    budget_max: null, liked_cuisines: [], favorite_categories: [],
  };

  const doc = preferenceDoc(prefs);
  if (!doc) return json({ results: [] }); // no taste signal yet (fresh account) — nothing to personalize on

  const { rows: catalog, error } = await getRankingCatalog<MenuItemRow>(supabase);
  if (error) return json({ error }, 500);
  if (catalog.length === 0) return json({ results: [] });

  // Vectors are fitted over the WHOLE catalog, then the hard filters decide
  // which results may surface. Fitting over the filtered catalog instead —
  // which this used to do — made every term's IDF depend on the caller's own
  // dietary settings, so two students could not be handed comparable scores
  // for the same dish. recommend-similar has always done it in this order.
  const vectors = buildTfidfVectors([...catalog.map(itemDoc), doc]);
  const userVec = vectors[vectors.length - 1];

  const scored = catalog
    .map((item, i) => ({ item, score: cosineSimilarity(userVec, vectors[i]) }))
    .filter(({ item }) => passesHardFilters(item, prefs))
    // id breaks score ties, so an unchanged catalog always yields the same
    // top-5 — plenty of items tie, most obviously every item scoring 0.
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, TOP_K);

  // What was actually served, for offline evaluation of the ranking — the
  // recommendation_log table existed from the first migration and nothing had
  // ever written to it. Best-effort: a logging failure must not cost the
  // student their recommendations.
  if (scored.length > 0) {
    await supabase.from('recommendation_log').insert({
      user_id: user.id,
      row_type: 'recommended_for_you',
      recommendation_type: 'content_tfidf_cosine',
      item_ids: scored.map(({ item }) => item.id),
      match_score: Number(scored[0].score.toFixed(4)),
    });
  }

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
