import { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Tap } from '@/components/Tap';
import { useLiveWhileFocused } from '@/hooks/useLiveWhileFocused';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';
import { bangkokHour, getMealSegment, type MealSegment } from '@/lib/time';
import { invokeEdgeFunction } from '@/lib/edge-function';
import { isDrinkCategory } from '@/lib/menu-categories';
import { DRINK_CATEGORY_FILTER, getTimeBasedCategories, restoreRank } from '@/lib/home-feed';
import { usePreferences, passesDietary } from '@/hooks/usePreferences';
import { CardRow, ItemCard } from '@/components/home/ItemCard';
import {
  TopBar, QueueBanner, PromotedSection, TrendingSection, NoQueueSection, StoreOptions, MenuItemCard,
  type Vendor, type MenuItem,
} from '@/components/home/sections';

// Hard dietary filter (is_halal/is_vegetarian/is_jay hide the item) and the
// warn-only allergen match both live in usePreferences now — shared with
// search, item/[id], cart and store/[id] so the vocabulary can't drift.
const passesDietaryFilters = passesDietary;

// recommend-for-you returns flat rows (no vendors() join — computed server-side).
type PersonalizedItem = { id: string; name: string; name_th: string | null; price: number; image_url: string | null; vendor_name: string; score: number };

// recommend-similar's response shape (same as item/[id].tsx's SimilarItem) — no name_th, unlocalized.
type SimilarToItem = { id: string; name: string; price: number; image_url: string | null; vendor_name: string; score: number };

// Bangkok hours, not device hours — the greeting sits directly above a meal
// row that getMealSegment() already picks in Bangkok time, so a device in
// another timezone was showing "Good evening" over the lunch selection.
function getGreetingKey(): TranslationKey {
  const h = bangkokHour(new Date());
  if (h < 12) return 'home.greetingMorning';
  if (h < 17) return 'home.greetingAfternoon';
  return 'home.greetingEvening';
}

function queueStatus(count: number | null): { labelKey: TranslationKey; color: string } {
  if (!count || count <= 3) return { labelKey: 'common.noQueue', color: '#22c55e' };
  if (count <= 8) return { labelKey: 'common.moderateQueue', color: '#f59e0b' };
  return { labelKey: 'common.busy', color: '#ef4444' };
}

// No Queue Right Now — same "no queue" threshold queueStatus() uses for the
// top banner, applied to the open-vendors list itself so it's a real,
// dedicated section instead of just sort order buried in Store Options.
const NO_QUEUE_THRESHOLD = 3;

function getTimeBasedHeaderKey(segment: MealSegment): TranslationKey {
  if (segment === 'breakfast') return 'home.timeBasedBreakfast';
  if (segment === 'lunch') return 'home.timeBasedLunch';
  return 'home.timeBasedDinner';
}

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const { prefs, loading: prefsLoading } = usePreferences();
  const [firstName, setFirstName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [allVendors, setAllVendors] = useState<Vendor[]>([]);
  const [featured, setFeatured] = useState<MenuItem | null>(null);
  const [trending, setTrending] = useState<MenuItem[]>([]);
  const [latestRelease, setLatestRelease] = useState<MenuItem[]>([]);
  const [drinks, setDrinks] = useState<MenuItem[]>([]);
  const [recommendedForYou, setRecommendedForYou] = useState<PersonalizedItem[]>([]);
  const [becauseYouOrdered, setBecauseYouOrdered] = useState<MenuItem[]>([]);
  const [timeBasedItems, setTimeBasedItems] = useState<MenuItem[]>([]);
  const [mealSegment, setMealSegment] = useState<MealSegment>('lunch');
  const [similarToFeatured, setSimilarToFeatured] = useState<SimilarToItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);

  async function loadData() {
    try {
      const segment = getMealSegment();
      const timeFilter = `available_time_segment.eq.${segment},available_time_segment.eq.all`;
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const menuFields = 'id,name,name_th,price,category,image_url,vendor_id,vendors(name),is_halal,is_vegetarian,is_jay,allergens';
      const asRows = (data: unknown) => (data as MenuItem[] | null) ?? [];
      // Every food section: what this student can eat, minus drinks (drinks
      // have their own row).
      const foodForMe = (rows: MenuItem[]) => rows.filter(i => passesDietaryFilters(i, prefs) && !isDrinkCategory(i.category));

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
        supabase.from('menu_items').select(menuFields).eq('is_featured', true).eq('is_available', true).order('id').limit(10),
        // Trending Meals Today — real order volume, most-ordered first (see get_trending_items).
        supabase.rpc('get_trending_items', { since: sevenDaysAgo, limit_n: 10 }),
        // Latest Release — the newest items in the catalog, matching the current
        // meal time. There is deliberately no "released in the last 7 days"
        // window: menu_items.release_date is only ever set by its column
        // default, so a bulk-seeded catalog shares one date and any fixed
        // window empties the section permanently once that date ages out.
        // Migration 20260910010000 spreads the seeded dates so "newest" means
        // something; ordering alone keeps the row populated forever.
        supabase.from('menu_items').select(menuFields).eq('is_available', true).or(timeFilter)
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
        supabase.from('menu_items').select(menuFields).eq('is_available', true)
          .in('category', getTimeBasedCategories(segment)).order('name', { ascending: true }).limit(10),
        // Drinks You Might Like — mirrors Latest Release's query, filtered to
        // drink categories instead of excluding them (see isDrinkCategory).
        supabase.from('menu_items').select(menuFields).eq('is_available', true)
          .or(DRINK_CATEGORY_FILTER)
          .order('release_date', { ascending: false }).order('name', { ascending: true }).limit(10),
      ]);

      if (profileRes.data?.name) setFirstName(profileRes.data.name.split(' ')[0]);
      if (profileRes.data?.avatar_url) setAvatarUrl(profileRes.data.avatar_url);

      const eligibleFeatured = foodForMe(asRows(featuredRes.data));
      // One promoted item per week, same for every student — a per-load
      // Math.random() pick showed a different item per user and per refresh.
      // Ordered query + week-number seed keeps the index (and so the item)
      // fixed all week, then rotates automatically the next week.
      const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
      const dbFeatured = eligibleFeatured.length > 0
        ? eligibleFeatured[weekNumber % eligibleFeatured.length]
        : undefined;

      setAllVendors((allVendorsRes.data as Vendor[] | null) ?? []);
      setFeatured(dbFeatured ?? null);

      // Trending and Because You Ordered both come back from their RPCs as
      // ranked id lists; each needs a follow-up fetch for the full rows
      // (filtered to what's still available now), then the RPC order restored.
      // The two follow-ups are independent — run them together, not in series.
      const trendingRanked = trendingRankRes.data as { menu_item_id: string; order_count: number }[] | null;
      const byoRanked = becauseYouOrderedRankRes.data as { menu_item_id: string; co_orders: number }[] | null;
      const trendingIds = trendingRanked?.map(r => r.menu_item_id) ?? [];
      const byoIds = byoRanked?.map(r => r.menu_item_id) ?? [];

      const [trendingRowsRes, byoRowsRes] = await Promise.all([
        trendingIds.length
          ? supabase.from('menu_items').select(menuFields).in('id', trendingIds).eq('is_available', true).or(timeFilter)
          : Promise.resolve({ data: null }),
        byoIds.length
          ? supabase.from('menu_items').select(menuFields).in('id', byoIds).eq('is_available', true)
          : Promise.resolve({ data: null }),
      ]);

      const dbTrending = restoreRank(trendingIds, foodForMe(asRows(trendingRowsRes.data)));
      setTrending(dbTrending.slice(0, 2));

      setLatestRelease(foodForMe(asRows(latestReleaseRes.data)));

      setDrinks(asRows(drinksRes.data).filter(i => passesDietaryFilters(i, prefs)));

      setBecauseYouOrdered(restoreRank(byoIds, foodForMe(asRows(byoRowsRes.data))));

      setRecommendedForYou(recommendedRes.data?.results ?? []);

      setMealSegment(segment);
      setTimeBasedItems(foodForMe(asRows(timeBasedRes.data)));
    } catch {
      // Supabase unreachable — show empty states, not fake data. Every list
      // has to be cleared, not just four of them: leaving the rest holding the
      // previous load's rows renders a half-stale feed that looks live.
      setAllVendors([]);
      setFeatured(null);
      setTrending([]);
      setDrinks([]);
      setLatestRelease([]);
      setTimeBasedItems([]);
      setRecommendedForYou([]);
      setBecauseYouOrdered([]);
      setSimilarToFeatured([]);
    }
    setLoading(false);
  }

  // Re-run when the shared prefs change so the hard dietary filter and the
  // allergen badges reflect the real values. Waiting on prefsLoading matters:
  // usePreferences emits twice on a cold start (DEFAULT_PREFERENCES, then the
  // loaded row), and firing on the first emit ran this whole ~10-query fanout
  // for a prefs object that was about to be replaced — the results were
  // thrown away a moment later. The screen is already showing its spinner
  // during that window, so nothing renders later than before.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!prefsLoading) void loadData(); }, [prefs, prefsLoading]);

  // Similar Foods — home page had no presence for this feature at all
  // (item/[id].tsx is the only other place it renders); anchor it on
  // today's Promoted item so the home feed gets one too. Best-effort:
  // hide the section on error rather than surface a broken state.
  useEffect(() => {
    if (!featured) return;
    invokeEdgeFunction<{ results: SimilarToItem[] }>('recommend-similar', { body: { item_id: featured.id } })
      .then(({ data }) => setSimilarToFeatured(data?.results ?? []))
      .catch(() => setSimilarToFeatured([]));
  }, [featured]);

  useLiveWhileFocused(async isCancelled => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setHasUnreadNotifications(false); return; }

    // Re-fetch name/avatar on every focus (not just mount) so a name/photo
    // change saved in edit-preferences shows up immediately on return,
    // instead of needing a full app reload — same pattern profile.tsx uses.
    const [profileRes, notifRes] = await Promise.all([
      supabase.from('users').select('name,avatar_url').eq('id', user.id).maybeSingle(),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
    ]);
    if (isCancelled()) return;
    if (profileRes.data?.name) setFirstName(profileRes.data.name.split(' ')[0]);
    setAvatarUrl(profileRes.data?.avatar_url ?? null);
    setHasUnreadNotifications(!!notifRes.count);

    // The focus refetch above only catches a status change while this tab was
    // backgrounded. If the student stays on home when the vendor updates the
    // order, the notifications row inserts live — subscribe so the dot lights
    // up without needing a tab-away-and-back, same pattern as notifications.tsx.
    const channel = supabase
      .channel(`home-notifications-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        if (!isCancelled()) setHasUnreadNotifications(true);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  });

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Brand.orange} size="large" />
      </SafeAreaView>
    );
  }

  // allVendors is already ordered open-first, then by queue — so the open
  // subset keeps the lowest-queue-first order the banner and section want.
  const openVendors = allVendors.filter(v => v.is_open === true);
  const topVendor = openVendors[0] ?? null;
  const queue = queueStatus(topVendor?.current_queue_count ?? null);
  const noQueueVendors = openVendors.filter(v => (v.current_queue_count ?? 0) <= NO_QUEUE_THRESHOLD).slice(0, 6);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      <TopBar avatarUrl={avatarUrl} firstName={firstName} hasUnreadNotifications={hasUnreadNotifications} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
        {/* Greeting */}
        <Text style={{ fontSize: 32, fontWeight: '700', color: '#261812', letterSpacing: -0.32, marginBottom: 20 }}>
          {t(getGreetingKey())}{firstName ? `, ${firstName}.` : '.'}
        </Text>

        {/* Search bar */}
        <Tap
          activeOpacity={0.8}
          onPress={() => router.push('/search')}
          style={{
            backgroundColor: 'rgba(248,221,210,0.5)', borderRadius: 16,
            paddingVertical: 18, paddingLeft: 48, paddingRight: 16, marginBottom: 20,
          }}
        >
          <View style={{ position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center' }}>
            <Text style={{ fontSize: 16 }}>🔍</Text>
          </View>
          <Text style={{ color: '#5a4136', fontSize: 16 }}>{t('home.searchPlaceholder')}</Text>
        </Tap>


        {topVendor && <QueueBanner vendor={topVendor} queue={queue} />}

        {/* Promoted Foods — sponsored items (is_featured), not personalized */}
        <PromotedSection featured={featured} />

        {/* Trending Meals Today — real order volume; own empty state when none */}
        <TrendingSection trending={trending} />

        {/* No Queue Right Now — open vendors under the same "no queue"
            threshold queueStatus() uses for the banner above; a real
            section instead of just Store Options' sort order. Sits below
            Promoted — paid placement ranks above organic queue picks. */}
        <NoQueueSection vendors={noQueueVendors} />

        {/* Similar Foods — content-based (TF-IDF + cosine over ingredients/
            tags/category), anchored on today's Promoted item. The only other
            place this renders is item/[id].tsx (anchored on whatever dish
            the student is viewing); the home feed has no "current dish" to
            anchor on, so Promoted stands in for that. */}
        {featured && (
          <CardRow title={t('home.similarFoodsTo', { name: localizedText(featured.name, featured.name_th, locale) })} count={similarToFeatured.length}>
            {similarToFeatured.map(item => (
              <ItemCard key={item.id} itemId={item.id} recommended imageUrl={item.image_url}
                title={item.name} vendorName={item.vendor_name} price={item.price} />
            ))}
          </CardRow>
        )}

        {/* Time-Based — items fitting the current meal segment by category
            (see getTimeBasedCategories). */}
        <CardRow title={t(getTimeBasedHeaderKey(mealSegment))} count={timeBasedItems.length} emptyText={t('home.noTimeBased')}>
          {timeBasedItems.map(item => <MenuItemCard key={item.id} item={item} />)}
        </CardRow>

        {/* Recommended For You — personalized TF-IDF ranking (cold-started
            from user_preferences until real order history exists) */}
        <CardRow title={t('home.recommendedForYou')} count={recommendedForYou.length}>
          {recommendedForYou.map(item => (
            <ItemCard key={item.id} itemId={item.id} recommended imageUrl={item.image_url}
              title={localizedText(item.name, item.name_th, locale)} vendorName={item.vendor_name} price={item.price} />
          ))}
        </CardRow>

        {/* Because You Ordered — collaborative filtering off the caller's
            own order history; empty until real orders exist */}
        <CardRow title={t('home.becauseYouOrdered')} count={becauseYouOrdered.length}>
          {becauseYouOrdered.map(item => <MenuItemCard key={item.id} item={item} recommended />)}
        </CardRow>

        {/* Latest Release — newest items in the catalog; own empty state when none */}
        <CardRow title={t('home.latestRelease')} count={latestRelease.length} emptyText={t('home.noLatestRelease')}>
          {latestRelease.map(item => (
            <MenuItemCard key={item.id} item={item} badge={
              <View style={{
                position: 'absolute', top: 8, right: 8,
                backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 99,
                paddingHorizontal: 8, paddingVertical: 4,
              }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#261812' }}>✨ {t('home.new')}</Text>
              </View>
            } />
          ))}
        </CardRow>

        {/* Drinks You Might Like — same shape as Latest Release, filtered to
            drink categories instead of excluding them (see isDrinkCategory) so
            drinks get their own section instead of mixing into food lists. */}
        <CardRow title={t('home.drinksForYou')} count={drinks.length} emptyText={t('home.noDrinks')}>
          {drinks.map(item => <MenuItemCard key={item.id} item={item} emoji="🥤" />)}
        </CardRow>

        <StoreOptions vendors={allVendors} />
      </ScrollView>
    </SafeAreaView>
  );
}
