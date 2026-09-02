import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';
import { getMealSegment, type MealSegment } from '@/lib/time';
import { invokeEdgeFunction } from '@/lib/edge-function';

// Exact path from the Figma export — the 🔔 emoji it replaced renders with
// its own baked-in colors on most platforms instead of a clean flat icon.
function BellIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.25} viewBox="0 0 16 20" fill="none">
      <Path
        d="M0 17V15H2V8C2 6.61667 2.41667 5.3875 3.25 4.3125C4.08333 3.2375 5.16667 2.53333 6.5 2.2V1.5C6.5 1.08333 6.64583 0.729167 6.9375 0.4375C7.22917 0.145833 7.58333 0 8 0C8.41667 0 8.77083 0.145833 9.0625 0.4375C9.35417 0.729167 9.5 1.08333 9.5 1.5V2.2C10.8333 2.53333 11.9167 3.2375 12.75 4.3125C13.5833 5.3875 14 6.61667 14 8V15H16V17H0V17M8 9.5V9.5V9.5V9.5V9.5V9.5V9.5V9.5V9.5M8 20C7.45 20 6.97917 19.8042 6.5875 19.4125C6.19583 19.0208 6 18.55 6 18H10C10 18.55 9.80417 19.0208 9.4125 19.4125C9.02083 19.8042 8.55 20 8 20V20M4 15H12V8C12 6.9 11.6083 5.95833 10.825 5.175C10.0417 4.39167 9.1 4 8 4C6.9 4 5.95833 4.39167 5.175 5.175C4.39167 5.95833 4 6.9 4 8V15V15"
        fill="#5A4136"
      />
    </Svg>
  );
}

type Vendor = {
  id: string;
  name: string;
  is_halal_certified: boolean | null;
  estimated_wait_min: number | null;
  current_queue_count: number | null;
  cuisine_tags: string[] | null;
  cover_image_url: string | null;
};

type MenuItem = {
  id: string;
  name: string;
  name_th: string | null;
  price: number;
  category: string | null;
  image_url: string | null;
  vendor_id: string;
  vendors: { name: string } | null;
};

// recommend-for-you returns flat rows (no vendors() join — computed server-side).
type PersonalizedItem = { id: string; name: string; name_th: string | null; price: number; image_url: string | null; vendor_name: string; score: number };

// recommend-similar's response shape (same as item/[id].tsx's SimilarItem) — no name_th, unlocalized.
type SimilarToItem = { id: string; name: string; price: number; image_url: string | null; vendor_name: string; score: number };

function getGreetingKey(): TranslationKey {
  const h = new Date().getHours();
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

// Time-Based — menu_items.available_time_segment is 'all' on every seeded
// row (a KMUTT stall's menu doesn't actually change by clock hour), so
// filtering on that column would just return the full catalog. Category is
// the real signal for "what fits this meal" instead.
const BREAKFAST_CATEGORIES = ['Beverages', 'Desserts', 'Add-ons'];
const LUNCH_CATEGORIES = ['Main Dishes (Rice)', 'Noodles', 'Main Dishes', 'Appetizers'];
const DINNER_CATEGORIES = ['Main Dishes (Rice)', 'Noodles', 'Main Dishes'];

function getTimeBasedCategories(segment: MealSegment): string[] {
  if (segment === 'breakfast') return BREAKFAST_CATEGORIES;
  if (segment === 'lunch') return LUNCH_CATEGORIES;
  return DINNER_CATEGORIES;
}

function getTimeBasedHeaderKey(segment: MealSegment): TranslationKey {
  if (segment === 'breakfast') return 'home.timeBasedBreakfast';
  if (segment === 'lunch') return 'home.timeBasedLunch';
  return 'home.timeBasedDinner';
}

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const [firstName, setFirstName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [featured, setFeatured] = useState<MenuItem | null>(null);
  const [trending, setTrending] = useState<MenuItem[]>([]);
  const [latestRelease, setLatestRelease] = useState<MenuItem[]>([]);
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
      const menuFields = 'id,name,name_th,price,category,image_url,vendor_id,vendors(name)';

      const { data: { user } } = await supabase.auth.getUser();
      const [profileRes, vendorsRes, featuredRes, trendingRankRes, latestReleaseRes, becauseYouOrderedRankRes, recommendedRes, timeBasedRes] = await Promise.all([
        user
          ? supabase.from('users').select('name,avatar_url').eq('id', user.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('vendors').select('id,name,is_halal_certified,estimated_wait_min,current_queue_count,cuisine_tags,cover_image_url').eq('is_open', true).order('current_queue_count', { ascending: true }),
        supabase.from('menu_items').select(menuFields).eq('is_featured', true).eq('is_available', true).limit(1),
        // Trending Meals Today — real order volume, most-ordered first (see get_trending_items).
        supabase.rpc('get_trending_items', { since: sevenDaysAgo, limit_n: 10 }),
        // Latest Release — newest items in the last 7 days, matching the current meal time.
        supabase.from('menu_items').select(menuFields).eq('is_available', true).or(timeFilter)
          .gte('release_date', sevenDaysAgo.slice(0, 10)).order('release_date', { ascending: false }).order('name', { ascending: true }).limit(10),
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
      ]);

      if (profileRes.data?.name) setFirstName(profileRes.data.name.split(' ')[0]);
      if (profileRes.data?.avatar_url) setAvatarUrl(profileRes.data.avatar_url);

      const dbVendors = vendorsRes.data as Vendor[] | null;
      const dbFeatured = featuredRes.data?.[0] as unknown as MenuItem | undefined;

      setVendors(dbVendors ?? []);
      setFeatured(dbFeatured ?? null);

      // Trending ids come ranked by order count from the RPC; re-fetch full
      // rows (filtered to items still available now) and restore that order.
      const trendingRanked = trendingRankRes.data as { menu_item_id: string; order_count: number }[] | null;
      let dbTrending: MenuItem[] | null = null;
      if (trendingRanked?.length) {
        const ids = trendingRanked.map(r => r.menu_item_id);
        const rank = new Map(ids.map((id, i) => [id, i]));
        const { data: trendingItems } = await supabase.from('menu_items').select(menuFields)
          .in('id', ids).eq('is_available', true).or(timeFilter);
        dbTrending = (trendingItems as unknown as MenuItem[] | null)
          ?.slice().sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)) ?? null;
      }

      setTrending(dbTrending?.slice(0, 2) ?? []);

      setLatestRelease((latestReleaseRes.data as unknown as MenuItem[] | null) ?? []);

      // Because You Ordered — same id-rank → full-row pattern as Trending.
      const byoRanked = becauseYouOrderedRankRes.data as { menu_item_id: string; co_orders: number }[] | null;
      if (byoRanked?.length) {
        const ids = byoRanked.map(r => r.menu_item_id);
        const rank = new Map(ids.map((id, i) => [id, i]));
        const { data: byoItems } = await supabase.from('menu_items').select(menuFields)
          .in('id', ids).eq('is_available', true);
        const ordered = (byoItems as unknown as MenuItem[] | null)
          ?.slice().sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)) ?? [];
        setBecauseYouOrdered(ordered);
      } else {
        setBecauseYouOrdered([]);
      }

      setRecommendedForYou(recommendedRes.data?.results ?? []);

      setMealSegment(segment);
      setTimeBasedItems((timeBasedRes.data as unknown as MenuItem[] | null) ?? []);
    } catch {
      // Supabase unreachable — show empty states, not fake data.
      setVendors([]);
      setFeatured(null);
      setTrending([]);
    }
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, []);

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

  useFocusEffect(
    useCallback(() => {
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) { setHasUnreadNotifications(false); return; }
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('read', false);
        setHasUnreadNotifications(!!count);
      });
    }, [])
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Brand.orange} size="large" />
      </SafeAreaView>
    );
  }

  const topVendor = vendors[0] ?? null;
  const queue = queueStatus(topVendor?.current_queue_count ?? null);
  const noQueueVendors = vendors.filter(v => (v.current_queue_count ?? 0) <= NO_QUEUE_THRESHOLD).slice(0, 6);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Top bar */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, height: 64,
      }}>
        <Tap onPress={() => router.push('/(tabs)/profile')}>
          <View style={{
            width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
            backgroundColor: Brand.orangeLight, borderWidth: 2, borderColor: Brand.card,
            alignItems: 'center', justifyContent: 'center',
          }}>
            {avatarUrl
              ? <Image source={{ uri: avatarUrl }} style={{ width: 40, height: 40 }} />
              : <Text style={{ fontSize: 16, fontWeight: '800', color: Brand.orange }}>{firstName.charAt(0).toUpperCase() || '?'}</Text>}
          </View>
        </Tap>
        <Text style={{ fontSize: 24, fontWeight: '800', letterSpacing: -1.2 }}>
          <Text style={{ color: '#020202' }}>Eat</Text>
          <Text style={{ color: Brand.orange }}>zy</Text>
        </Text>
        <Tap onPress={() => router.push('/notifications')}>
          <View style={{ position: 'relative' }}>
            <BellIcon size={18} />
            {hasUnreadNotifications && (
              <View style={{
                position: 'absolute', top: -1, right: -1, width: 8, height: 8, borderRadius: 4,
                backgroundColor: Brand.orange, borderWidth: 1.5, borderColor: Brand.bg,
              }} />
            )}
          </View>
        </Tap>
      </View>

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

        {/* Queue banner */}
        {topVendor && (
          <View style={{
            backgroundColor: '#f8ddd2', borderRadius: 24,
            paddingHorizontal: 16, paddingVertical: 16,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 28,
            shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.04, shadowRadius: 15, elevation: 2,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: '#fff8f6', alignItems: 'center', justifyContent: 'center',
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05, shadowRadius: 1, elevation: 1,
              }}>
                <Text style={{ fontSize: 18 }}>🏪</Text>
              </View>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#261812' }}>
                  {topVendor.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: queue.color }} />
                  <Text style={{ fontSize: 12, color: '#5a4136' }}>
                    {t(queue.labelKey)} • {topVendor.estimated_wait_min ?? 5}–{(topVendor.estimated_wait_min ?? 5) + 3} min
                  </Text>
                </View>
              </View>
            </View>
            <Tap onPress={() => router.push(`/store/${topVendor.id}`)}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#a04100' }}>{t('home.view')}</Text>
            </Tap>
          </View>
        )}

        {/* No Queue Right Now — open vendors under the same "no queue"
            threshold queueStatus() uses for the banner above; a real
            section instead of just Store Options' sort order. */}
        <View style={{ marginBottom: 28 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812', marginBottom: 16 }}>
            {t('home.noQueueRightNow')}
          </Text>
          {noQueueVendors.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {noQueueVendors.map(vendor => (
                <Tap
                  key={vendor.id}
                  onPress={() => router.push(`/store/${vendor.id}`)}
                  activeOpacity={0.85}
                  style={{
                    width: 150, borderRadius: 24, backgroundColor: Brand.card, overflow: 'hidden',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.04, shadowRadius: 30, elevation: 2,
                  }}
                >
                  <View style={{ height: 130, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
                    {vendor.cover_image_url
                      ? <Image source={{ uri: vendor.cover_image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      : <Text style={{ fontSize: 36 }}>🏪</Text>
                    }
                    <View style={{
                      position: 'absolute', top: 8, right: 8,
                      backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 99,
                      paddingHorizontal: 8, paddingVertical: 4,
                      flexDirection: 'row', alignItems: 'center', gap: 3,
                    }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#261812' }}>{t('common.noQueue')}</Text>
                    </View>
                  </View>
                  <View style={{ padding: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#261812' }} numberOfLines={1}>
                      {vendor.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#5a4136' }} numberOfLines={1}>
                      {vendor.estimated_wait_min ?? 5}–{(vendor.estimated_wait_min ?? 5) + 3} min
                    </Text>
                  </View>
                </Tap>
              ))}
            </ScrollView>
          ) : (
            <View style={{
              borderRadius: 24, backgroundColor: Brand.card, height: 120,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8,
            }}>
              <Text style={{ color: Brand.textSecondary }}>{t('home.noQueueEmpty')}</Text>
            </View>
          )}
        </View>

        {/* Promoted Foods — sponsored items (is_featured), not personalized */}
        <View style={{ marginBottom: 28 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812', marginBottom: 16 }}>
            {t('home.promoted')}
          </Text>

          {/* Featured card */}
          {featured ? (
            <View style={{
              borderRadius: 24, overflow: 'hidden', marginBottom: 12,
              shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.04, shadowRadius: 30, elevation: 3,
            }}>
              {/* Orange gradient border */}
              <View style={{ padding: 2, borderRadius: 24, backgroundColor: Brand.orange }}>
                <View style={{ borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.88)', padding: 16 }}>
                  {/* New menu badge */}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: '#f8ddd2', borderRadius: 99,
                    paddingHorizontal: 8, paddingVertical: 4,
                    alignSelf: 'flex-start', marginBottom: 12,
                  }}>
                    <Text style={{ fontSize: 9 }}>✨</Text>
                    <Text style={{ fontSize: 12, color: '#5a4136' }}>{t('home.newMenu')}</Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ fontSize: 22, fontWeight: '700', color: '#261812', lineHeight: 29, marginBottom: 4 }}>
                        {localizedText(featured.name, featured.name_th, locale)}
                      </Text>
                      <Text style={{ fontSize: 15, color: '#5a4136', marginBottom: 14 }}>
                        {featured.category ?? t('home.thaiFood')}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 20, fontWeight: '700', color: '#a04100' }}>
                          ฿{featured.price}
                        </Text>
                        <Tap
                          onPress={() => router.push(`/item/${featured.id}`)}
                          style={{
                            backgroundColor: '#a04100', borderRadius: 16,
                            paddingHorizontal: 16, paddingVertical: 8,
                            shadowColor: '#FF6B00', shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.39, shadowRadius: 7, elevation: 3,
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{t('home.addToCart')}</Text>
                        </Tap>
                      </View>
                    </View>
                    {/* Food image */}
                    <View style={{
                      width: 110, height: 110, borderRadius: 12,
                      backgroundColor: Brand.orangeLight, overflow: 'hidden',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {featured.image_url
                        ? <Image source={{ uri: featured.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        : <Text style={{ fontSize: 44 }}>🍽️</Text>
                      }
                    </View>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={{
              borderRadius: 24, backgroundColor: Brand.card, height: 120,
              alignItems: 'center', justifyContent: 'center', marginBottom: 12,
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8,
            }}>
              <Text style={{ color: Brand.textSecondary }}>{t('home.noFeaturedItems')}</Text>
            </View>
          )}

          {/* Trending small cards — real order volume; own empty state when none */}
          {trending.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {trending.map(item => (
                <Tap
                  key={item.id}
                  onPress={() => router.push(`/item/${item.id}`)}
                  activeOpacity={0.85}
                  style={{
                    flex: 1, borderRadius: 24, backgroundColor: Brand.card, overflow: 'hidden',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.04, shadowRadius: 30, elevation: 2,
                  }}
                >
                  {/* Image area */}
                  <View style={{ height: 150, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
                    {item.image_url
                      ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      : <Text style={{ fontSize: 40 }}>🍽️</Text>
                    }
                    {/* Trending badge */}
                    <View style={{
                      position: 'absolute', top: 8, right: 8,
                      backgroundColor: 'rgba(255,255,255,0.9)',
                      borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4,
                      flexDirection: 'row', alignItems: 'center', gap: 3,
                    }}>
                      <Text style={{ fontSize: 9 }}>🔥</Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#261812' }}>{t('home.trending')}</Text>
                    </View>
                  </View>
                  {/* Info */}
                  <View style={{ padding: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#261812', marginBottom: 2 }} numberOfLines={2}>
                      {localizedText(item.name, item.name_th, locale)}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#5a4136', marginBottom: 8 }} numberOfLines={1}>
                      {item.vendors?.name ?? '—'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#a04100' }}>
                        ฿{item.price}
                      </Text>
                      <View style={{
                        width: 32, height: 32, borderRadius: 16,
                        backgroundColor: '#ffeae1', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 18, color: Brand.orange, lineHeight: 20 }}>+</Text>
                      </View>
                    </View>
                  </View>
                </Tap>
              ))}
            </View>
          ) : (
            <View style={{
              borderRadius: 24, backgroundColor: Brand.card, height: 120,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8,
            }}>
              <Text style={{ color: Brand.textSecondary }}>{t('home.noTrending')}</Text>
            </View>
          )}
        </View>

        {/* Similar Foods — content-based (TF-IDF + cosine over ingredients/
            tags/category), anchored on today's Promoted item. The only other
            place this renders is item/[id].tsx (anchored on whatever dish
            the student is viewing); the home feed has no "current dish" to
            anchor on, so Promoted stands in for that. */}
        {featured && similarToFeatured.length > 0 && (
          <View style={{ marginBottom: 28 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812', marginBottom: 16 }}>
              {t('home.similarFoodsTo', { name: localizedText(featured.name, featured.name_th, locale) })}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {similarToFeatured.map(item => (
                <Tap
                  key={item.id}
                  onPress={() => router.push(`/item/${item.id}`)}
                  activeOpacity={0.85}
                  style={{
                    width: 150, borderRadius: 24, backgroundColor: Brand.card, overflow: 'hidden',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.04, shadowRadius: 30, elevation: 2,
                  }}
                >
                  <View style={{ height: 130, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
                    {item.image_url
                      ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      : <Text style={{ fontSize: 36 }}>🍽️</Text>
                    }
                  </View>
                  <View style={{ padding: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#261812' }} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#5a4136', marginBottom: 4 }} numberOfLines={1}>
                      {item.vendor_name}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#a04100' }}>฿{item.price}</Text>
                  </View>
                </Tap>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Time-Based — items fitting the current meal segment by category
            (see getTimeBasedCategories). */}
        <View style={{ marginBottom: 28 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812', marginBottom: 16 }}>
            {t(getTimeBasedHeaderKey(mealSegment))}
          </Text>
          {timeBasedItems.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {timeBasedItems.map(item => (
                <Tap
                  key={item.id}
                  onPress={() => router.push(`/item/${item.id}`)}
                  activeOpacity={0.85}
                  style={{
                    width: 150, borderRadius: 24, backgroundColor: Brand.card, overflow: 'hidden',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.04, shadowRadius: 30, elevation: 2,
                  }}
                >
                  <View style={{ height: 130, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
                    {item.image_url
                      ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      : <Text style={{ fontSize: 36 }}>🍽️</Text>
                    }
                  </View>
                  <View style={{ padding: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#261812' }} numberOfLines={2}>
                      {localizedText(item.name, item.name_th, locale)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#5a4136', marginBottom: 4 }} numberOfLines={1}>
                      {item.vendors?.name ?? ''}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#a04100' }}>฿{item.price}</Text>
                  </View>
                </Tap>
              ))}
            </ScrollView>
          ) : (
            <View style={{
              borderRadius: 24, backgroundColor: Brand.card, height: 120,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8,
            }}>
              <Text style={{ color: Brand.textSecondary }}>{t('home.noTimeBased')}</Text>
            </View>
          )}
        </View>

        {/* Recommended For You — personalized TF-IDF ranking (cold-started
            from user_preferences until real order history exists) */}
        {recommendedForYou.length > 0 && (
          <View style={{ marginBottom: 28 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812', marginBottom: 16 }}>
              {t('home.recommendedForYou')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {recommendedForYou.map(item => (
                <Tap
                  key={item.id}
                  onPress={() => router.push(`/item/${item.id}`)}
                  activeOpacity={0.85}
                  style={{
                    width: 150, borderRadius: 24, backgroundColor: Brand.card, overflow: 'hidden',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.04, shadowRadius: 30, elevation: 2,
                  }}
                >
                  <View style={{ height: 130, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
                    {item.image_url
                      ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      : <Text style={{ fontSize: 36 }}>🍽️</Text>
                    }
                  </View>
                  <View style={{ padding: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#261812' }} numberOfLines={2}>
                      {localizedText(item.name, item.name_th, locale)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#5a4136', marginBottom: 4 }} numberOfLines={1}>
                      {item.vendor_name}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#a04100' }}>฿{item.price}</Text>
                  </View>
                </Tap>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Because You Ordered — collaborative filtering off the caller's
            own order history; empty until real orders exist */}
        {becauseYouOrdered.length > 0 && (
          <View style={{ marginBottom: 28 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812', marginBottom: 16 }}>
              {t('home.becauseYouOrdered')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {becauseYouOrdered.map(item => (
                <Tap
                  key={item.id}
                  onPress={() => router.push(`/item/${item.id}`)}
                  activeOpacity={0.85}
                  style={{
                    width: 150, borderRadius: 24, backgroundColor: Brand.card, overflow: 'hidden',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.04, shadowRadius: 30, elevation: 2,
                  }}
                >
                  <View style={{ height: 130, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
                    {item.image_url
                      ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      : <Text style={{ fontSize: 36 }}>🍽️</Text>
                    }
                  </View>
                  <View style={{ padding: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#261812' }} numberOfLines={2}>
                      {localizedText(item.name, item.name_th, locale)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#5a4136', marginBottom: 4 }} numberOfLines={1}>
                      {item.vendors?.name ?? ''}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#a04100' }}>฿{item.price}</Text>
                  </View>
                </Tap>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Latest Release — newest items in the last 7 days; own empty state when none */}
        <View style={{ marginBottom: 28 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812', marginBottom: 16 }}>
            {t('home.latestRelease')}
          </Text>
          {latestRelease.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {latestRelease.map(item => (
                <Tap
                  key={item.id}
                  onPress={() => router.push(`/item/${item.id}`)}
                  activeOpacity={0.85}
                  style={{
                    width: 150, borderRadius: 24, backgroundColor: Brand.card, overflow: 'hidden',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.04, shadowRadius: 30, elevation: 2,
                  }}
                >
                  <View style={{ height: 130, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
                    {item.image_url
                      ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      : <Text style={{ fontSize: 36 }}>🍽️</Text>
                    }
                    <View style={{
                      position: 'absolute', top: 8, right: 8,
                      backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 99,
                      paddingHorizontal: 8, paddingVertical: 4,
                    }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: '#261812' }}>✨ {t('home.new')}</Text>
                    </View>
                  </View>
                  <View style={{ padding: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#261812' }} numberOfLines={2}>
                      {localizedText(item.name, item.name_th, locale)}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#5a4136', marginBottom: 4 }} numberOfLines={1}>
                      {item.vendors?.name ?? ''}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#a04100' }}>฿{item.price}</Text>
                  </View>
                </Tap>
              ))}
            </ScrollView>
          ) : (
            <View style={{
              borderRadius: 24, backgroundColor: Brand.card, height: 120,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8,
            }}>
              <Text style={{ color: Brand.textSecondary }}>{t('home.noLatestRelease')}</Text>
            </View>
          )}
        </View>

        {/* Store Options */}
        <View>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812' }}>
              {t('home.storeOptions')}
            </Text>
            {vendors.length > 0 && (
              <Tap onPress={() => router.push('/stores')} haptic={false}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: Brand.orange }}>
                  {t('home.seeAll')} ›
                </Text>
              </Tap>
            )}
          </View>
          <View style={{ gap: 12 }}>
            {vendors.slice(0, 6).map(vendor => (
              <Tap
                key={vendor.id}
                onPress={() => router.push(`/store/${vendor.id}`)}
                activeOpacity={0.85}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 16,
                  backgroundColor: Brand.card, borderRadius: 24, padding: 12,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.04, shadowRadius: 30, elevation: 2,
                }}
              >
                <View style={{
                  width: 62, height: 62, borderRadius: 12,
                  backgroundColor: Brand.orangeLight, overflow: 'hidden',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {vendor.cover_image_url
                    ? <Image source={{ uri: vendor.cover_image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    : <Text style={{ fontSize: 28 }}>🏪</Text>
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#261812', marginBottom: 2 }}>
                    {vendor.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#5a4136', marginBottom: 6 }}>
                    {vendor.cuisine_tags?.[0] ?? t('home.thaiFood')}
                  </Text>
                  {vendor.is_halal_certified && (
                    <View style={{
                      backgroundColor: '#ffeae1', borderRadius: 4,
                      paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start',
                    }}>
                      <Text style={{ fontSize: 10, color: '#565656' }}>{t('common.halal')}</Text>
                    </View>
                  )}
                </View>
              </Tap>
            ))}
            {vendors.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ color: Brand.textSecondary }}>{t('home.noStallsOpen')}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
