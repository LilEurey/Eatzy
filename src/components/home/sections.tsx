import type { ReactNode } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Tap } from '@/components/Tap';
import { Brand } from '@/constants/theme';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';
import { AllergenPill, EmptyCard, ItemCard, SectionTitle } from '@/components/home/ItemCard';

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

// One row shape for all three vendor surfaces. Store Options lists every
// stall (closed ones dimmed with a "Closed" badge); the queue banner and
// "No Queue Right Now" use the open subset, derived client-side rather than
// re-queried — the two used to be separate round trips fetching overlapping
// columns from the same 16-row table.
export type Vendor = {
  id: string;
  name: string;
  is_halal_certified: boolean | null;
  estimated_wait_min: number | null;
  current_queue_count: number | null;
  cuisine_tags: string[] | null;
  cover_image_url: string | null;
  is_open: boolean | null;
};

export type MenuItem = {
  id: string;
  name: string;
  name_th: string | null;
  price: number;
  category: string | null;
  image_url: string | null;
  vendor_id: string;
  vendors: { name: string } | null;
  is_halal: boolean;
  is_vegetarian: boolean;
  is_jay: boolean;
  allergens: string[] | null;
};

export function TopBar({ avatarUrl, firstName, hasUnreadNotifications }: { avatarUrl: string | null; firstName: string; hasUnreadNotifications: boolean }) {
  return (
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
  );
}

export function QueueBanner({ vendor, queue }: { vendor: Vendor; queue: { labelKey: TranslationKey; color: string } }) {
  const { t } = useI18n();
  return (
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
            {vendor.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: queue.color }} />
            <Text style={{ fontSize: 12, color: '#5a4136' }}>
              {t(queue.labelKey)} • {vendor.estimated_wait_min ?? 5}–{(vendor.estimated_wait_min ?? 5) + 3} min
            </Text>
          </View>
        </View>
      </View>
      <Tap onPress={() => router.push(`/store/${vendor.id}`)}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#a04100' }}>{t('home.view')}</Text>
      </Tap>
    </View>
  );
}

export function PromotedSection({ featured }: { featured: MenuItem | null }) {
  const { t, locale } = useI18n();
  return (
    <View style={{ marginBottom: 28 }}>
      <SectionTitle>{t('home.promoted')}</SectionTitle>

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
                  <AllergenPill allergens={featured.allergens} />
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
                    ? <Image source={{ uri: featured.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    : <Text style={{ fontSize: 44 }}>🍽️</Text>
                  }
                </View>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <EmptyCard text={t('home.noFeaturedItems')} marginBottom={12} />
      )}
    </View>
  );
}

export function TrendingSection({ trending }: { trending: MenuItem[] }) {
  const { t, locale } = useI18n();
  return (
    <View style={{ marginBottom: 28 }}>
      <SectionTitle>{t('home.trendingToday')}</SectionTitle>

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
                  ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
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
                <AllergenPill allergens={item.allergens} />
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
        <EmptyCard text={t('home.noTrending')} />
      )}
    </View>
  );
}

export function NoQueueSection({ vendors }: { vendors: Vendor[] }) {
  const { t } = useI18n();
  return (
    <View style={{ marginBottom: 28 }}>
      <SectionTitle>{t('home.noQueueRightNow')}</SectionTitle>
      {vendors.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {vendors.map(vendor => (
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
                  ? <Image source={{ uri: vendor.cover_image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
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
        <EmptyCard text={t('home.noQueueEmpty')} />
      )}
    </View>
  );
}

export function StoreOptions({ vendors }: { vendors: Vendor[] }) {
  const { t } = useI18n();
  return (
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
        {vendors.slice(0, 6).map(vendor => {
          const closed = vendor.is_open === false;
          return (
          <Tap
            key={vendor.id}
            onPress={() => router.push(`/store/${vendor.id}`)}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 16,
              backgroundColor: Brand.card, borderRadius: 24, padding: 12,
              opacity: closed ? 0.5 : 1,
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
                ? <Image source={{ uri: vendor.cover_image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                : <Text style={{ fontSize: 28 }}>🏪</Text>
              }
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#261812' }}>
                  {vendor.name}
                </Text>
                {closed && (
                  <View style={{
                    backgroundColor: Brand.border, borderRadius: 4,
                    paddingHorizontal: 6, paddingVertical: 2,
                  }}>
                    <Text style={{ fontSize: 10, color: Brand.textSecondary, fontWeight: '600' }}>
                      {t('common.closed')}
                    </Text>
                  </View>
                )}
              </View>
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
          );
        })}
        {vendors.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Text style={{ color: Brand.textSecondary }}>{t('home.noStores')}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// Card for rows that come back as full menu_items (with vendors(name) + allergens).
export function MenuItemCard({ item, recommended, emoji, badge }: { item: MenuItem; recommended?: boolean; emoji?: string; badge?: ReactNode }) {
  const { locale } = useI18n();
  return (
    <ItemCard
      itemId={item.id} recommended={recommended} emoji={emoji} badge={badge}
      imageUrl={item.image_url} title={localizedText(item.name, item.name_th, locale)}
      vendorName={item.vendors?.name ?? ''} price={item.price} allergens={item.allergens}
    />
  );
}
