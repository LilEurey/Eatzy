import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { MOCK_VENDORS, MOCK_MENU_ITEMS, getVendorName } from '@/lib/mock-data';
import { showAlert } from '@/lib/alert';
import { useI18n, type TranslationKey } from '@/lib/i18n';

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
  price: number;
  category: string | null;
  image_url: string | null;
  vendor_id: string;
  vendors: { name: string } | null;
};

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

export default function HomeScreen() {
  const { t } = useI18n();
  const [firstName, setFirstName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [featured, setFeatured] = useState<MenuItem | null>(null);
  const [trending, setTrending] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const [profileRes, vendorsRes, featuredRes, trendingRes] = await Promise.all([
        user
          ? supabase.from('users').select('name,avatar_url').eq('id', user.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('vendors').select('id,name,is_halal_certified,estimated_wait_min,current_queue_count,cuisine_tags,cover_image_url').eq('is_open', true).order('current_queue_count', { ascending: true }),
        supabase.from('menu_items').select('id,name,price,category,image_url,vendor_id,vendors(name)').eq('is_featured', true).eq('is_available', true).limit(1),
        supabase.from('menu_items').select('id,name,price,category,image_url,vendor_id,vendors(name)').eq('is_available', true).limit(2),
      ]);

      if (profileRes.data?.name) setFirstName(profileRes.data.name.split(' ')[0]);
      if (profileRes.data?.avatar_url) setAvatarUrl(profileRes.data.avatar_url);

      const dbVendors = vendorsRes.data as Vendor[] | null;
      const dbFeatured = featuredRes.data?.[0] as unknown as MenuItem | undefined;
      const dbTrending = trendingRes.data as unknown as MenuItem[] | null;

      // Fall back to mock data when DB is empty
      setVendors(dbVendors?.length ? dbVendors : MOCK_VENDORS as unknown as Vendor[]);

      if (dbFeatured) {
        setFeatured(dbFeatured);
      } else {
        const mockFeatured = MOCK_MENU_ITEMS.find(i => i.is_featured)!;
        setFeatured({ ...mockFeatured, vendors: { name: getVendorName(mockFeatured.vendor_id) } });
      }

      if (dbTrending?.length) {
        setTrending(dbTrending);
      } else {
        const mockTrending = MOCK_MENU_ITEMS.filter(i => !i.is_featured).slice(0, 2);
        setTrending(mockTrending.map(i => ({ ...i, vendors: { name: getVendorName(i.vendor_id) } })));
      }
    } catch {
      // Full fallback if Supabase is unreachable
      const mockFeatured = MOCK_MENU_ITEMS.find(i => i.is_featured)!;
      setVendors(MOCK_VENDORS as unknown as Vendor[]);
      setFeatured({ ...mockFeatured, vendors: { name: getVendorName(mockFeatured.vendor_id) } });
      const mockTrending = MOCK_MENU_ITEMS.filter(i => !i.is_featured).slice(0, 2);
      setTrending(mockTrending.map(i => ({ ...i, vendors: { name: getVendorName(i.vendor_id) } })));
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount; loadData guards its own setLoading(false)
  useEffect(() => { void loadData(); }, []);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Brand.orange} size="large" />
      </SafeAreaView>
    );
  }

  const topVendor = vendors[0] ?? null;
  const queue = queueStatus(topVendor?.current_queue_count ?? null);
  const comingSoon = () => showAlert(t('common.comingSoonTitle'), t('common.comingSoonMsg'));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Top bar */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, height: 64,
      }}>
        <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
          <View style={{
            width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
            backgroundColor: Brand.orangeLight, borderWidth: 2, borderColor: Brand.card,
            alignItems: 'center', justifyContent: 'center',
          }}>
            {avatarUrl
              ? <Image source={{ uri: avatarUrl }} style={{ width: 40, height: 40 }} />
              : <Text style={{ fontSize: 18 }}>👤</Text>}
          </View>
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: '800', letterSpacing: -1.2 }}>
          <Text style={{ color: '#020202' }}>Eat</Text>
          <Text style={{ color: Brand.orange }}>zy</Text>
        </Text>
        <TouchableOpacity onPress={() => router.push('/notifications')}>
          <Text style={{ fontSize: 22 }}>🔔</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
        {/* Greeting */}
        <Text style={{ fontSize: 32, fontWeight: '700', color: '#261812', letterSpacing: -0.32, marginBottom: 20 }}>
          {t(getGreetingKey())}{firstName ? `, ${firstName}.` : '.'}
        </Text>

        {/* Search bar */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={comingSoon}
          style={{
            backgroundColor: 'rgba(248,221,210,0.5)', borderRadius: 16,
            paddingVertical: 18, paddingLeft: 48, paddingRight: 16, marginBottom: 20,
          }}
        >
          <View style={{ position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center' }}>
            <Text style={{ fontSize: 16 }}>🔍</Text>
          </View>
          <Text style={{ color: '#5a4136', fontSize: 16 }}>{t('home.searchPlaceholder')}</Text>
        </TouchableOpacity>

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
            <TouchableOpacity onPress={() => router.push(`/store/${topVendor.id}`)}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#a04100' }}>{t('home.view')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Recommended For You */}
        <View style={{ marginBottom: 28 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812', marginBottom: 16 }}>
            {t('home.recommendedForYou')}
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
                        {featured.name}
                      </Text>
                      <Text style={{ fontSize: 15, color: '#5a4136', marginBottom: 14 }}>
                        {featured.category ?? t('home.thaiFood')}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 20, fontWeight: '700', color: '#a04100' }}>
                          ฿{featured.price}
                        </Text>
                        <TouchableOpacity
                          onPress={() => router.push(`/item/${featured.id}`)}
                          style={{
                            backgroundColor: '#a04100', borderRadius: 16,
                            paddingHorizontal: 16, paddingVertical: 8,
                            shadowColor: '#FF6B00', shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.39, shadowRadius: 7, elevation: 3,
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{t('home.addToCart')}</Text>
                        </TouchableOpacity>
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
                        : <Text style={{ fontSize: 44 }}>🍛</Text>
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

          {/* Trending small cards */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {[0, 1].map(i => {
              const item = trending[i];
              const emojis = ['🥤', '🍚'];
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => item && router.push(`/item/${item.id}`)}
                  activeOpacity={0.85}
                  style={{
                    flex: 1, borderRadius: 24, backgroundColor: Brand.card, overflow: 'hidden',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.04, shadowRadius: 30, elevation: 2,
                  }}
                >
                  {/* Image area */}
                  <View style={{ height: 120, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
                    {item?.image_url
                      ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      : <Text style={{ fontSize: 40 }}>{emojis[i]}</Text>
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
                      {item?.name ?? '—'}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#5a4136', marginBottom: 8 }} numberOfLines={1}>
                      {item?.vendors?.name ?? '—'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#a04100' }}>
                        {item ? `฿${item.price}` : '—'}
                      </Text>
                      <View style={{
                        width: 32, height: 32, borderRadius: 16,
                        backgroundColor: '#ffeae1', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 18, color: Brand.orange, lineHeight: 20 }}>+</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Store Options */}
        <View>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812', marginBottom: 16 }}>
            {t('home.storeOptions')}
          </Text>
          <View style={{ gap: 12 }}>
            {vendors.slice(0, 6).map(vendor => (
              <TouchableOpacity
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
              </TouchableOpacity>
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
