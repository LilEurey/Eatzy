import { useState, useCallback } from 'react';
import { Bone, SkeletonHome } from '@/components/Skeleton';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Animated from 'react-native-reanimated';
import { enterUp } from '@/lib/motion';
import { Tap } from '@/components/Tap';
import { useLiveWhileFocused } from '@/hooks/useLiveWhileFocused';
import { useFocusGuard } from '@/hooks/useFocusGuard';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';
import { bangkokHour, type MealSegment, isStoreOpen } from '@/lib/time';
import { loadHomeFeed, type PersonalizedItem, type SimilarToItem } from '@/lib/home-feed';
import { usePreferences, refreshPreferences } from '@/hooks/usePreferences';
import { CardRow, ItemCard, SectionTitle } from '@/components/home/ItemCard';
import {
  TopBar, QueueBanner, PromotedSection, TrendingSection, NoQueueSection, StoreOptions, MenuItemCard,
  type Vendor, type MenuItem,
} from '@/components/home/sections';

// Hard dietary filter (is_halal/is_vegetarian/is_jay hide the item) and the
// warn-only allergen match both live in usePreferences (passesDietary /
// matchAllergens) — shared with search, item/[id], cart and store/[id] so the
// vocabulary can't drift. loadHomeFeed (lib/home-feed.ts) is where the home
// screen applies passesDietary to each section — see that module for the
// query fanout itself.

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

// Stand-in for a recommendation row whose edge function hasn't answered yet —
// same title and card footprint as the real CardRow, so the sections below
// don't jump when it fills in.
function PendingRow({ title }: { title: string }) {
  return (
    <View style={{ marginBottom: 28 }}>
      <SectionTitle>{title}</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {[0, 1, 2].map(i => <Bone key={i} style={{ width: 150, height: 210, borderRadius: 24 }} />)}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const { prefs, loading: prefsLoading, error: prefsError } = usePreferences();
  const [firstName, setFirstName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [allVendors, setAllVendors] = useState<Vendor[]>([]);
  const [featured, setFeatured] = useState<MenuItem | null>(null);
  const [trending, setTrending] = useState<MenuItem[]>([]);
  const [latestRelease, setLatestRelease] = useState<MenuItem[]>([]);
  const [drinks, setDrinks] = useState<MenuItem[]>([]);
  // null = the edge function hasn't answered yet (first load only) — renders
  // a PendingRow. A later reload keeps the previous rows until the new ones land.
  const [recommendedForYou, setRecommendedForYou] = useState<PersonalizedItem[] | null>(null);
  const [becauseYouOrdered, setBecauseYouOrdered] = useState<MenuItem[]>([]);
  const [timeBasedItems, setTimeBasedItems] = useState<MenuItem[]>([]);
  const [mealSegment, setMealSegment] = useState<MealSegment>('lunch');
  const [similarToFeatured, setSimilarToFeatured] = useState<SimilarToItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);

  const focusGuard = useFocusGuard();
  const { key: refreshKey, done: refreshDone, control: refreshControl } = usePullToRefresh();

  // The whole fetch-filter-rank fanout (8 concurrent queries, dietary +
  // drink-category filtering, rank restore, the two recommendation rows) lives in
  // loadHomeFeed (lib/home-feed.ts) so it's unit-tested without a React tree.
  // It never throws — a failed load comes back with every section already
  // emptied, so there's one plain spread into state here, not a try/catch.
  //
  // Runs on focus (not just mount) — a vendor's queue count, an item going
  // unavailable, or a new trending item must show up on return from another
  // tab, same pattern as wallet.tsx / search.tsx. It also re-runs whenever
  // prefs finish loading (or change) while Home is already the focused tab,
  // since that changes this callback's identity and useFocusEffect
  // re-invokes immediately for an already-focused screen. Waiting on
  // prefsLoading matters: usePreferences emits twice on a cold start
  // (DEFAULT_PREFERENCES, then the loaded row), and firing on the first
  // emit ran this whole ~12-query fanout for a prefs object that was about
  // to be replaced — the results were thrown away a moment later.
  useFocusEffect(
    useCallback(() => {
      if (prefsLoading) return;
      const cancelledRef = focusGuard.snapshot();
      void (async () => {
        const result = await loadHomeFeed(prefs);
        if (cancelledRef.current) return;
        if (result.profile?.name) setFirstName(result.profile.name.split(' ')[0]);
        if (result.profile?.avatarUrl) setAvatarUrl(result.profile.avatarUrl);
        setMealSegment(result.mealSegment);
        setAllVendors(result.allVendors);
        setFeatured(result.featured);
        setTrending(result.trending);
        setLatestRelease(result.latestRelease);
        setDrinks(result.drinks);
        setBecauseYouOrdered(result.becauseYouOrdered);
        setTimeBasedItems(result.timeBasedItems);
        setLoading(false);
        refreshDone();
        // The two edge-function rows are still in flight (0.7–1.8s each vs
        // ~150ms for everything above) — the feed is on screen already and
        // these fill in when they land. Neither promise rejects.
        void result.recommendedForYou.then(rows => { if (!cancelledRef.current) setRecommendedForYou(rows); });
        void result.similarToFeatured.then(rows => { if (!cancelledRef.current) setSimilarToFeatured(rows); });
      })();
    // refreshKey: a pull re-runs the fanout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusGuard, prefs, prefsLoading, refreshKey, refreshDone])
  );

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
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
        <SkeletonHome />
      </SafeAreaView>
    );
  }

  if (prefsError) {
    // Saved halal/vegetarian/jay prefs failed to load — loadHomeFeed would
    // silently filter this fanout on stale/default prefs (no restriction),
    // showing a restricted student items they can't eat. Skip rendering the
    // feed entirely rather than risk that; same "don't proceed on a failed
    // prefs load" call as cart.tsx / search.tsx.
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
          <View style={{
            backgroundColor: '#fee2e2', borderRadius: 12, borderWidth: 1, borderColor: '#fecaca',
            paddingHorizontal: 14, paddingVertical: 12,
          }}>
            <Text style={{ fontSize: 13, color: '#b91c1c', fontWeight: '700', marginBottom: 8 }}>
              {t('cart.prefsNotReadyMsg')}
            </Text>
            <Tap onPress={() => void refreshPreferences()} haptic={false}>
              <Text style={{ fontSize: 13, color: '#b91c1c', fontWeight: '700', textDecorationLine: 'underline' }}>
                {t('common.tryAgain')}
              </Text>
            </Tap>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // allVendors is already ordered open-first, then by queue — so the open
  // subset keeps the lowest-queue-first order the banner and section want.
  const openVendors = allVendors.filter(v => isStoreOpen(v));
  const topVendor = openVendors[0] ?? null;
  const queue = queueStatus(topVendor?.current_queue_count ?? null);
  const noQueueVendors = openVendors.filter(v => (v.current_queue_count ?? 0) <= NO_QUEUE_THRESHOLD).slice(0, 6);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      <TopBar avatarUrl={avatarUrl} firstName={firstName} hasUnreadNotifications={hasUnreadNotifications} />

      <ScrollView refreshControl={refreshControl} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
        {/* Greeting */}
        <Animated.Text entering={enterUp()} lineBreakStrategyIOS="push-out" textBreakStrategy="balanced" style={{ fontSize: 32, fontWeight: '700', color: '#261812', letterSpacing: -0.32, marginBottom: 20 }}>
          {t(getGreetingKey())}{firstName ? `, ${firstName}.` : '.'}
        </Animated.Text>

        {/* Search bar */}
        <Animated.View entering={enterUp(80)}>
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
        </Animated.View>


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
        {featured && !similarToFeatured && (
          <PendingRow title={t('home.similarFoodsTo', { name: localizedText(featured.name, featured.name_th, locale) })} />
        )}
        {featured && similarToFeatured && (
          <CardRow title={t('home.similarFoodsTo', { name: localizedText(featured.name, featured.name_th, locale) })} count={similarToFeatured.length}>
            {similarToFeatured.map(item => (
              <ItemCard key={item.id} itemId={item.id} recommended imageUrl={item.image_url}
                title={localizedText(item.name, item.name_th, locale)} vendorName={item.vendor_name} price={item.price} />
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
        {recommendedForYou ? (
          <CardRow title={t('home.recommendedForYou')} count={recommendedForYou.length}>
            {recommendedForYou.map(item => (
              <ItemCard key={item.id} itemId={item.id} recommended imageUrl={item.image_url}
                title={localizedText(item.name, item.name_th, locale)} vendorName={item.vendor_name} price={item.price} />
            ))}
          </CardRow>
        ) : (
          <PendingRow title={t('home.recommendedForYou')} />
        )}

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
