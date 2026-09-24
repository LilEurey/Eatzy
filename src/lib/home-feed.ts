import { supabase } from '@/lib/supabase';
import { invokeEdgeFunction } from '@/lib/edge-function';
import { DRINK_CATEGORIES, isDrinkCategory } from '@/lib/menu-categories';
import { getMealSegment, type MealSegment } from '@/lib/time';
import { passesDietary, type Preferences } from '@/hooks/usePreferences';
import type { Vendor, MenuItem } from '@/components/home/sections';

// Pure pieces of the student home feed, kept out of the screen so the rules
// that only used to live in comments are unit-tested (see
// __tests__/home-feed.test.ts).

// Time-Based — menu_items.available_time_segment is 'all' on every seeded
// row (a KMUTT stall's menu doesn't actually change by clock hour), so
// filtering on that column would just return the full catalog. Category is
// the real signal for "what fits this meal" instead.
//
// Breakfast used to be ['Beverages', 'Desserts', 'Add-ons'], which collapsed
// to almost nothing: the drink filter applied to this section strips
// 'Beverages', by far the biggest of the three, leaving ~6 desserts and a
// pile of add-ons that aren't meals. These are the categories a Thai campus
// stall actually serves in the morning, and none of them is a drink — a drink
// category here silently empties the section, because home strips drinks from
// it.
const BREAKFAST_CATEGORIES = ['Noodles', 'Soup', 'Appetizers', 'Main Dishes (Rice)'];
const LUNCH_CATEGORIES = ['Main Dishes (Rice)', 'Noodles', 'Main Dishes', 'Appetizers'];
const DINNER_CATEGORIES = ['Main Dishes (Rice)', 'Noodles', 'Main Dishes'];

export function getTimeBasedCategories(segment: MealSegment): string[] {
  if (segment === 'breakfast') return BREAKFAST_CATEGORIES;
  if (segment === 'lunch') return LUNCH_CATEGORIES;
  return DINNER_CATEGORIES;
}

/** PostgREST `.or()` filter matching every drink category (case-insensitive),
 * derived from the one DRINK_CATEGORIES list so it can't drift from
 * isDrinkCategory(). */
export const DRINK_CATEGORY_FILTER = DRINK_CATEGORIES.map(c => `category.ilike.${c}`).join(',');

/** Trending and Because You Ordered come back from their RPCs as ranked id
 * lists, then a follow-up fetch returns the rows in arbitrary order. Restore
 * the RPC order; anything the RPC didn't rank sorts last, not first (`?? 0`
 * used to promote an unranked row to the top of a "most ordered" list). */
export function restoreRank<T extends { id: string }>(rankedIds: string[], rows: T[]): T[] {
  const rank = new Map(rankedIds.map((id, i) => [id, i]));
  const at = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
  return rows.slice().sort((a, b) => at(a.id) - at(b.id));
}

// recommend-for-you returns flat rows (no vendors() join — computed server-side).
export type PersonalizedItem = { id: string; name: string; name_th: string | null; price: number; image_url: string | null; vendor_name: string; score: number };

// recommend-similar's response shape (same as item/[id].tsx's SimilarItem).
export type SimilarToItem = { id: string; name: string; name_th: string | null; price: number; image_url: string | null; vendor_name: string; score: number };

export type HomeFeedResult = {
  // null on an anonymous session or a failed load — the caller only applies
  // name/avatar when this is non-null (same guarded-set behavior loadData
  // used to have: a missing name/avatar leaves whatever was already on screen).
  profile: { name: string | null; avatarUrl: string | null } | null;
  mealSegment: MealSegment;
  allVendors: Vendor[];
  featured: MenuItem | null;
  trending: MenuItem[];
  latestRelease: MenuItem[];
  drinks: MenuItem[];
  recommendedForYou: PersonalizedItem[];
  becauseYouOrdered: MenuItem[];
  timeBasedItems: MenuItem[];
  similarToFeatured: SimilarToItem[];
};

// Every food section: what this student can eat, minus drinks (drinks have
// their own row). Used to be a closure re-derived inside (tabs)/index.tsx's
// loadData() and called from half a dozen sites in there — a plain function
// here so it can't drift between call sites again.
function foodForMe(rows: MenuItem[], prefs: Preferences): MenuItem[] {
  return rows.filter(i => passesDietary(i, prefs) && !isDrinkCategory(i.category));
}

/** The student home screen's whole data fanout in one call: 9 concurrent
 * Supabase/RPC/edge-function queries, the dietary + drink-category filter
 * every food section shares, and the rank restore for the two RPC-ranked
 * sections (Trending, Because You Ordered). Folds in Similar Foods too —
 * anchored on today's Promoted item, same as it always was, but that used to
 * be a second `useEffect` keyed on `featured` with its own independent
 * fetch-and-catch. Bundling it into this same load means a network failure
 * here can't leave it showing stale rows the way it used to: loadData's own
 * catch cleared eight pieces of state and never this one.
 *
 * Never throws — a failed load resolves to this same shape with every list
 * emptied (see the `empty` fallback below), so the caller always does one
 * plain spread into state instead of running its own try/catch. `now`
 * defaults to the real clock; tests pin it for a deterministic meal segment
 * and Promoted pick. */
export async function loadHomeFeed(prefs: Preferences, now: Date = new Date()): Promise<HomeFeedResult> {
  const segment = getMealSegment(now);
  const empty: HomeFeedResult = {
    profile: null, mealSegment: segment, allVendors: [], featured: null, trending: [],
    latestRelease: [], drinks: [], recommendedForYou: [], becauseYouOrdered: [],
    timeBasedItems: [], similarToFeatured: [],
  };

  try {
    const timeFilter = `available_time_segment.eq.${segment},available_time_segment.eq.all`;
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const menuFields = 'id,name,name_th,price,category,image_url,vendor_id,vendors(name),is_halal,is_vegetarian,is_jay,allergens';
    const asRows = (data: unknown) => (data as MenuItem[] | null) ?? [];
    // Hard dietary filters go into the SQL too, so each section's .limit(10)
    // counts only dishes this student can eat — filtering 10 arbitrary rows
    // client-side left jay/vegetarian students with near-empty sections.
    // foodForMe() below stays as the backstop.
    const dietMatch = {
      ...(prefs.is_halal && { is_halal: true }),
      ...(prefs.is_vegetarian && { is_vegetarian: true }),
      ...(prefs.is_jay && { is_jay: true }),
    };

    const { data: { user } } = await supabase.auth.getUser();
    const [profileRes, allVendorsRes, featuredRes, trendingRankRes, latestReleaseRes, becauseYouOrderedRankRes, recommendedRes, timeBasedRes, drinksRes] = await Promise.all([
      user
        ? supabase.from('users').select('name,avatar_url').eq('id', user.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      // Every stall, open first then by queue. Closed stalls stay visible in
      // Store Options (dimmed + "Closed" badge); the queue banner and
      // "No Queue Right Now" filter this same list down to the open ones.
      supabase.from('vendors').select('id,name,is_halal_certified,estimated_wait_min,current_queue_count,cuisine_tags,cover_image_url,is_open').order('is_open', { ascending: false }).order('current_queue_count', { ascending: true }),
      // Fetch a few candidates, not just 1 — the featured item can fail
      // the caller's dietary filter, and we need another to fall back to.
      supabase.from('menu_items').select(menuFields).eq('is_featured', true).eq('is_available', true).match(dietMatch).order('id').limit(10),
      // Trending Meals Today — real order volume, most-ordered first (see get_trending_items).
      supabase.rpc('get_trending_items', { since: sevenDaysAgo, limit_n: 10 }),
      // Latest Release — the newest items in the catalog, matching the current
      // meal time. There is deliberately no "released in the last 7 days"
      // window: menu_items.release_date is only ever set by its column
      // default, so a bulk-seeded catalog shares one date and any fixed
      // window empties the section permanently once that date ages out.
      // Migration 20260910010000 spreads the seeded dates so "newest" means
      // something; ordering alone keeps the row populated forever.
      supabase.from('menu_items').select(menuFields).eq('is_available', true).match(dietMatch).or(timeFilter)
        .order('release_date', { ascending: false }).order('name', { ascending: true }).limit(10),
      // Because You Ordered — collaborative filtering off the caller's own order
      // history (see get_because_you_ordered); anonymous or order-less users
      // just get zero rows back, not an error.
      user ? supabase.rpc('get_because_you_ordered', { limit_n: 10 }) : Promise.resolve({ data: null, error: null }),
      // Recommended For You — personalized TF-IDF ranking, cold-started from
      // user_preferences until real order history exists (see recommend-for-you).
      invokeEdgeFunction<{ results: PersonalizedItem[] }>('recommend-for-you'),
      // Time-Based — items fitting the current meal segment by category
      // (see getTimeBasedCategories: available_time_segment itself is 'all'
      // on every seeded row, so category is the real signal here).
      supabase.from('menu_items').select(menuFields).eq('is_available', true).match(dietMatch)
        .in('category', getTimeBasedCategories(segment)).order('name', { ascending: true }).limit(10),
      // Drinks You Might Like — mirrors Latest Release's query, filtered to
      // drink categories instead of excluding them (see isDrinkCategory).
      supabase.from('menu_items').select(menuFields).eq('is_available', true).match(dietMatch)
        .or(DRINK_CATEGORY_FILTER)
        .order('release_date', { ascending: false }).order('name', { ascending: true }).limit(10),
    ]);

    const profile = { name: profileRes.data?.name ?? null, avatarUrl: profileRes.data?.avatar_url ?? null };

    const eligibleFeatured = foodForMe(asRows(featuredRes.data), prefs);
    // One promoted item per week, same for every student — a per-load
    // Math.random() pick showed a different item per user and per refresh.
    // Ordered query + week-number seed keeps the index (and so the item)
    // fixed all week, then rotates automatically the next week.
    const weekNumber = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
    const featured = eligibleFeatured.length > 0 ? eligibleFeatured[weekNumber % eligibleFeatured.length] : null;

    // Trending and Because You Ordered both come back from their RPCs as
    // ranked id lists; each needs a follow-up fetch for the full rows
    // (filtered to what's still available now), then the RPC order restored.
    // Similar Foods needs its own follow-up too, once `featured` is known —
    // all three are independent, so they run together, not in series.
    const trendingRanked = trendingRankRes.data as { menu_item_id: string; order_count: number }[] | null;
    const byoRanked = becauseYouOrderedRankRes.data as { menu_item_id: string; co_orders: number }[] | null;
    const trendingIds = trendingRanked?.map(r => r.menu_item_id) ?? [];
    const byoIds = byoRanked?.map(r => r.menu_item_id) ?? [];

    const [trendingRowsRes, byoRowsRes, similarRes] = await Promise.all([
      trendingIds.length
        ? supabase.from('menu_items').select(menuFields).in('id', trendingIds).eq('is_available', true).or(timeFilter)
        : Promise.resolve({ data: null }),
      byoIds.length
        ? supabase.from('menu_items').select(menuFields).in('id', byoIds).eq('is_available', true)
        : Promise.resolve({ data: null }),
      // Best-effort: invokeEdgeFunction resolves (never rejects) on a normal
      // failure response, so one bad Similar Foods call doesn't drag the rest
      // of this load down with it — it just yields an empty section below.
      featured
        ? invokeEdgeFunction<{ results: SimilarToItem[] }>('recommend-similar', { body: { item_id: featured.id } })
        : Promise.resolve({ data: null, error: null }),
    ]);

    return {
      profile,
      mealSegment: segment,
      allVendors: (allVendorsRes.data as Vendor[] | null) ?? [],
      featured,
      trending: restoreRank(trendingIds, foodForMe(asRows(trendingRowsRes.data), prefs)).slice(0, 2),
      latestRelease: foodForMe(asRows(latestReleaseRes.data), prefs),
      drinks: asRows(drinksRes.data).filter(i => passesDietary(i, prefs)),
      recommendedForYou: recommendedRes.data?.results ?? [],
      becauseYouOrdered: restoreRank(byoIds, foodForMe(asRows(byoRowsRes.data), prefs)),
      timeBasedItems: foodForMe(asRows(timeBasedRes.data), prefs),
      similarToFeatured: similarRes.data?.results ?? [],
    };
  } catch {
    // Supabase unreachable — show empty states, not fake data. Every list has
    // to come back cleared, not just some of them: leaving the rest holding a
    // previous load's rows renders a half-stale feed that looks live.
    return empty;
  }
}
