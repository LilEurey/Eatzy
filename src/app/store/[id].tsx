import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, ActivityIndicator } from 'react-native';
import { Tap } from '@/components/Tap';
import { ReviewCard } from '@/components/ReviewCard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';
import { usePreferences, passesDietary, matchAllergens } from '@/hooks/usePreferences';
import type { Database } from '@/types/database.types';

type Vendor = Database['public']['Tables']['vendors']['Row'];
type MenuItem = Database['public']['Tables']['menu_items']['Row'];
type StoreReview = {
  id: string;
  score: number;
  comment: string | null;
  created_at: string;
  photo_urls: string[];
  menu_item_id: string;
  users: { name: string | null; avatar_url: string | null } | null;
};

function queueStatus(count: number): { labelKey: TranslationKey; color: string } {
  if (count <= 3) return { labelKey: 'common.noQueue', color: '#22c55e' };
  if (count <= 8) return { labelKey: 'common.moderate', color: '#f59e0b' };
  return { labelKey: 'common.busy', color: '#ef4444' };
}

function spiceLabel(level: number, t: ReturnType<typeof useI18n>['t']) {
  if (level === 0) return t('common.noSpice');
  return '🌶'.repeat(level);
}

export default function StoreDetailScreen() {
  const { t, locale } = useI18n();
  const { prefs } = usePreferences();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'menus' | 'reviews'>('menus');
  const [activeCategory, setActiveCategory] = useState('All');
  const [vendor, setVendor] = useState<Vendor | null | undefined>(undefined);
  const [allItems, setAllItems] = useState<MenuItem[]>([]);
  const [reviews, setReviews] = useState<StoreReview[]>([]);

  useEffect(() => {
    async function load() {
      const [vendorRes, itemsRes] = await Promise.all([
        supabase.from('vendors').select('*').eq('id', id).maybeSingle(),
        supabase.from('menu_items').select('*').eq('vendor_id', id).order('name'),
      ]);
      setVendor(vendorRes.data ?? null);
      setAllItems(itemsRes.data ?? []);

      // Ratings are keyed to menu items, not vendors — fan out over this
      // store's items to collect its reviews.
      const itemIds = (itemsRes.data ?? []).map(i => i.id);
      if (itemIds.length === 0) { setReviews([]); return; }
      const { data: reviewRows } = await supabase
        .from('ratings')
        .select('id,score,comment,created_at,photo_urls,menu_item_id,users(name,avatar_url)')
        .in('menu_item_id', itemIds)
        .order('created_at', { ascending: false });
      setReviews((reviewRows ?? []) as unknown as StoreReview[]);
    }
    void load();
  }, [id]);

  // Hard dietary filter applies here too (was missing) — a halal/veg/jay
  // student shouldn't see items they can't eat in a stall's menu, same as the
  // home feed and search. Allergies still only warn (pill below), never hide.
  const visibleItems = allItems.filter(i => passesDietary(i, prefs));
  const categories = ['All', ...Array.from(new Set(visibleItems.map(i => i.category).filter((c): c is string => !!c)))];
  const filteredItems = activeCategory === 'All'
    ? visibleItems
    : visibleItems.filter(i => i.category === activeCategory);

  const avgScore = reviews.length
    ? reviews.reduce((s, r) => s + r.score, 0) / reviews.length
    : 0;
  const itemNameById = new Map(allItems.map(i => [i.id, localizedText(i.name, i.name_th, locale)]));

  if (vendor === undefined) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Brand.orange} size="large" />
      </SafeAreaView>
    );
  }

  if (!vendor) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 }}>
          <Tap onPress={() => router.back()}>
            <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
          </Tap>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 40 }}>🏪</Text>
          <Text style={{ color: Brand.textSecondary, marginTop: 12 }}>{t('store.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const queue = queueStatus(vendor.current_queue_count);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header image area */}
        <View style={{ height: 220, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
          {vendor.cover_image_url
            ? <Image source={{ uri: vendor.cover_image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            : <Text style={{ fontSize: 72 }}>🏪</Text>
          }
          {/* Back button */}
          <Tap
            onPress={() => router.back()}
            style={{
              position: 'absolute', top: 16, left: 16,
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.9)',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
            }}
          >
            <Text style={{ fontSize: 18, color: Brand.textPrimary }}>←</Text>
          </Tap>

          {/* Open badge */}
          <View style={{
            position: 'absolute', top: 16, right: 16,
            backgroundColor: vendor.is_open ? '#22c55e' : '#ef4444',
            borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4,
          }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
              {vendor.is_open ? t('common.open') : t('common.closed')}
            </Text>
          </View>
        </View>

        {vendor.is_open === false && (
          <View style={{
            backgroundColor: '#fdecec', borderLeftWidth: 3, borderLeftColor: '#ef4444',
            paddingHorizontal: 20, paddingVertical: 12,
          }}>
            <Text style={{ fontSize: 13, color: '#b91c1c', fontWeight: '600' }}>
              {t('store.closedBanner')}
            </Text>
          </View>
        )}

        <View style={{ padding: 20 }}>
          {/* Vendor name + tags row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: Brand.textPrimary, flex: 1 }}>
              {vendor.name}
            </Text>
            {vendor.is_halal_certified && (
              <View style={{
                backgroundColor: '#d1fae5', borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 4,
              }}>
                <Text style={{ fontSize: 12, color: '#065f46', fontWeight: '700' }}>{t('common.halalCertified')}</Text>
              </View>
            )}
          </View>

          {/* Cuisine tags */}
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {vendor.cuisine_tags.map(tag => (
              <View key={tag} style={{
                backgroundColor: Brand.orangeLight, borderRadius: 99,
                paddingHorizontal: 10, paddingVertical: 4,
              }}>
                <Text style={{ fontSize: 12, color: Brand.orange, fontWeight: '600' }}>{tag}</Text>
              </View>
            ))}
          </View>

          {/* Average rating */}
          {reviews.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}>
              <Text style={{ fontSize: 14, color: Brand.orange }}>★</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.textPrimary }}>{avgScore.toFixed(1)}</Text>
              <Text style={{ fontSize: 13, color: Brand.textSecondary }}>({reviews.length})</Text>
            </View>
          )}

          {/* Stats row */}
          <View style={{
            flexDirection: 'row', gap: 12, marginBottom: 16,
            backgroundColor: Brand.card, borderRadius: 16, padding: 14,
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
          }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, marginBottom: 2 }}>⏱</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.textPrimary }}>
                {vendor.estimated_wait_min}–{vendor.estimated_wait_min + 3} min
              </Text>
              <Text style={{ fontSize: 11, color: Brand.textSecondary }}>{t('store.waitTime')}</Text>
            </View>
            <View style={{ width: 1, backgroundColor: Brand.border }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: queue.color }} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.textPrimary }}>
                {t('store.ordersCount', { n: vendor.current_queue_count })}
              </Text>
              <Text style={{ fontSize: 11, color: Brand.textSecondary }}>{t(queue.labelKey)}</Text>
            </View>
            <View style={{ width: 1, backgroundColor: Brand.border }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, marginBottom: 2 }}>🕐</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.textPrimary }}>
                {vendor.open_time?.slice(0, 5)}–{vendor.close_time?.slice(0, 5)}
              </Text>
              <Text style={{ fontSize: 11, color: Brand.textSecondary }}>{t('store.hours')}</Text>
            </View>
          </View>

          {/* Bio */}
          <Text style={{ fontSize: 14, color: Brand.textSecondary, lineHeight: 20, marginBottom: 24 }}>
            {localizedText(vendor.bio ?? '', vendor.bio_th, locale)}
          </Text>

          {/* Tabs: All Menus / Review */}
          <View style={{
            flexDirection: 'row', gap: 24, marginBottom: 16,
            borderBottomWidth: 1, borderBottomColor: Brand.border,
          }}>
            {([
              ['menus', t('store.allMenusTab')],
              ['reviews', t('store.reviewsTab')],
            ] as const).map(([key, label]) => {
              const active = activeTab === key;
              return (
                <Tap
                  key={key}
                  onPress={() => setActiveTab(key)}
                  style={{
                    paddingBottom: 10,
                    borderBottomWidth: 2,
                    borderBottomColor: active ? Brand.orange : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '700', color: active ? Brand.orange : Brand.textSecondary }}>
                    {label}
                  </Text>
                </Tap>
              );
            })}
          </View>

          {activeTab === 'menus' ? (
          <>
          {/* Category tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {categories.map(cat => {
                const active = cat === activeCategory;
                return (
                  <Tap
                    key={cat}
                    onPress={() => setActiveCategory(cat)}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99,
                      backgroundColor: active ? Brand.orange : Brand.card,
                      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: active ? 0 : 0.04, shadowRadius: 4, elevation: active ? 0 : 1,
                    }}
                  >
                    <Text style={{
                      fontSize: 13, fontWeight: '600',
                      color: active ? '#fff' : Brand.textSecondary,
                    }}>
                      {cat === 'All' ? t('store.all') : cat}
                    </Text>
                  </Tap>
                );
              })}
            </View>
          </ScrollView>

          {/* Menu items */}
          <View style={{ gap: 12 }}>
            {filteredItems.map(item => (
              <Tap
                key={item.id}
                onPress={() => router.push(`/item/${item.id}`)}
                activeOpacity={0.85}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  backgroundColor: Brand.card, borderRadius: 20, padding: 14,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
                }}
              >
                {/* Image */}
                <View style={{
                  width: 80, height: 80, borderRadius: 14,
                  backgroundColor: Brand.orangeLight, overflow: 'hidden',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {item.image_url
                    ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    : <Text style={{ fontSize: 34 }}>🍽️</Text>
                  }
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary, marginBottom: 3 }}>
                    {localizedText(item.name, item.name_th, locale)}
                  </Text>
                  <Text style={{ fontSize: 12, color: Brand.textSecondary, marginBottom: 6 }} numberOfLines={2}>
                    {localizedText(item.description ?? '', item.description_th, locale)}
                  </Text>

                  {/* Dietary badges */}
                  <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {item.is_halal && (
                      <View style={{ backgroundColor: '#d1fae5', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color: '#065f46', fontWeight: '600' }}>{t('common.halal')}</Text>
                      </View>
                    )}
                    {item.is_vegetarian && (
                      <View style={{ backgroundColor: '#dcfce7', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color: '#166534', fontWeight: '600' }}>{t('store.veg')}</Text>
                      </View>
                    )}
                    {item.spice_level > 0 && (
                      <View style={{ backgroundColor: '#fef3c7', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color: '#92400e' }}>{spiceLabel(item.spice_level, t)}</Text>
                      </View>
                    )}
                    {matchAllergens(item.allergens, prefs).length > 0 && (
                      <View style={{ backgroundColor: '#fee2e2', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color: '#b91c1c', fontWeight: '700' }}>{t('search.containsAllergen')}</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#a04100' }}>
                      ฿{item.price}
                    </Text>
                    <View style={{
                      width: 30, height: 30, borderRadius: 15,
                      backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 18, color: Brand.orange, lineHeight: 20 }}>+</Text>
                    </View>
                  </View>
                </View>
              </Tap>
            ))}

            {filteredItems.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>🍽️</Text>
                <Text style={{ color: Brand.textSecondary }}>{t('store.noItemsInCategory')}</Text>
              </View>
            )}
          </View>
          </>
          ) : (
          /* Review tab */
          <View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary, marginBottom: 14 }}>
              {t('reviews.communityReviews')}
            </Text>
            {reviews.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>💬</Text>
                <Text style={{ color: Brand.textSecondary }}>{t('reviews.empty')}</Text>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                {reviews.map(r => (
                  <ReviewCard
                    key={r.id}
                    name={r.users?.name ?? t('reviews.anonymous')}
                    avatarUrl={r.users?.avatar_url ?? null}
                    score={r.score}
                    comment={r.comment}
                    createdAt={r.created_at}
                    menuItemName={itemNameById.get(r.menu_item_id)}
                    photoUrls={r.photo_urls}
                  />
                ))}
              </View>
            )}
          </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
