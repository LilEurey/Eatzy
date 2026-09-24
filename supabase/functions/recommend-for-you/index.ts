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

import { callerClient, corsAndJson } from '../_shared/http.ts';
import { getRankingCatalog } from '../_shared/catalog.ts';
import { callerDietFrom, rankForPreferences } from '../_shared/ranking.ts';

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

Deno.serve(async (req) => {
  const { cors, json } = corsAndJson(req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = callerClient(req.headers.get('Authorization') ?? '');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ results: [] }); // not signed in — nothing personal to rank on

  const diet = callerDietFrom<UserPreferences>(user.id, await supabase
    .from('user_preferences')
    .select('is_halal,is_vegetarian,is_jay,budget_max,liked_cuisines,favorite_categories')
    .eq('user_id', user.id)
    .maybeSingle());
  // A failed read must not fall back to "no restrictions" (fail closed).
  if (diet.kind === 'error') return json({ error: diet.message }, 500);
  if (diet.kind !== 'saved') return json({ results: [] }); // no preferences yet — no taste signal
  const prefs = diet.prefs;

  const doc = preferenceDoc(prefs);
  if (!doc) return json({ results: [] }); // no taste signal yet (fresh account) — nothing to personalize on

  const { rows: catalog, error } = await getRankingCatalog<MenuItemRow>(supabase);
  if (error) return json({ error }, 500);
  if (catalog.length === 0) return json({ results: [] });

  // Fit-over-whole-catalog, hard filters, id tie-break and top-K all live in
  // _shared/ranking.ts (shared with recommend-similar, and unit-tested).
  const scored = rankForPreferences(catalog, doc, prefs);

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
