import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { addToCart } from '@/lib/cart-store';
import { useI18n } from '@/lib/i18n';
import type { Database } from '@/types/database.types';

type MenuItem = Database['public']['Tables']['menu_items']['Row'];

function SpiceIndicator({ level }: { level: number }) {
  const { t } = useI18n();
  if (level === 0) return <Text style={{ fontSize: 12, color: Brand.textSecondary }}>{t('common.noSpice')}</Text>;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={{ fontSize: 14, opacity: i < level ? 1 : 0.2 }}>🌶</Text>
      ))}
    </View>
  );
}

export default function ItemDetailScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [qty, setQty] = useState(1);
  const [item, setItem] = useState<MenuItem | null | undefined>(undefined);
  const [vendorName, setVendorName] = useState('');

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('menu_items').select('*, vendors(name)').eq('id', id).maybeSingle();
      setItem(data ?? null);
      setVendorName((data as any)?.vendors?.name ?? '');
    }
    void load();
  }, [id]);

  if (item === undefined) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Brand.orange} size="large" />
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 40 }}>🍽️</Text>
          <Text style={{ color: Brand.textSecondary, marginTop: 12 }}>{t('item.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const total = item.price * qty;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>
        {/* Image area */}
        <View style={{ height: 280, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
          {item.image_url
            ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            : <Text style={{ fontSize: 90 }}>🍽️</Text>
          }
          {/* Back button */}
          <TouchableOpacity
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
          </TouchableOpacity>

          {/* Featured badge */}
          {item.is_featured && (
            <View style={{
              position: 'absolute', top: 16, right: 16,
              backgroundColor: Brand.orange, borderRadius: 99,
              paddingHorizontal: 10, paddingVertical: 4,
              flexDirection: 'row', alignItems: 'center', gap: 4,
            }}>
              <Text style={{ fontSize: 10 }}>✨</Text>
              <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>{t('item.featured')}</Text>
            </View>
          )}
        </View>

        <View style={{ padding: 20 }}>
          {/* Name + vendor */}
          <Text style={{ fontSize: 26, fontWeight: '800', color: Brand.textPrimary, letterSpacing: -0.5, marginBottom: 4 }}>
            {item.name}
          </Text>
          <TouchableOpacity onPress={() => router.push(`/store/${item.vendor_id}`)}>
            <Text style={{ fontSize: 14, color: Brand.orange, fontWeight: '600', marginBottom: 14 }}>
              {vendorName} ›
            </Text>
          </TouchableOpacity>

          {/* Dietary badges */}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {item.is_halal && (
              <View style={{ backgroundColor: '#d1fae5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 13, color: '#065f46', fontWeight: '700' }}>{t('common.halalCertified')}</Text>
              </View>
            )}
            {item.is_vegetarian && (
              <View style={{ backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 13, color: '#166534', fontWeight: '700' }}>{t('common.vegetarian')}</Text>
              </View>
            )}
            {item.is_jay && (
              <View style={{ backgroundColor: '#fef9c3', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 13, color: '#854d0e', fontWeight: '700' }}>{t('common.jay')}</Text>
              </View>
            )}
          </View>

          {/* Spice level */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: Brand.textSecondary, fontWeight: '600' }}>{t('item.spice')}</Text>
            <SpiceIndicator level={item.spice_level} />
          </View>

          {/* Description */}
          <Text style={{ fontSize: 15, color: Brand.textSecondary, lineHeight: 22, marginBottom: 20 }}>
            {item.description}
          </Text>

          {/* Stats row */}
          <View style={{
            flexDirection: 'row', gap: 1, marginBottom: 20,
            backgroundColor: Brand.card, borderRadius: 16, overflow: 'hidden',
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
          }}>
            {[
              { icon: '🔥', value: `${item.calories} kcal`, label: t('item.calories') },
              { icon: '⏱', value: `${item.preparation_time_min} min`, label: t('item.prepTime') },
              { icon: '🏷️', value: `฿${item.price}`, label: t('item.price') },
            ].map(({ icon, value, label }, i) => (
              <View key={label} style={{
                flex: 1, alignItems: 'center', paddingVertical: 14,
                borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: Brand.border,
              }}>
                <Text style={{ fontSize: 20, marginBottom: 4 }}>{icon}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.textPrimary }}>{value}</Text>
                <Text style={{ fontSize: 11, color: Brand.textSecondary }}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Ingredients */}
          {item.ingredients.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary, marginBottom: 8 }}>
                {t('item.ingredients')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {item.ingredients.map(ing => (
                  <View key={ing} style={{
                    backgroundColor: Brand.orangeLight, borderRadius: 99,
                    paddingHorizontal: 10, paddingVertical: 4,
                  }}>
                    <Text style={{ fontSize: 12, color: '#5a4136' }}>{ing}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Allergens */}
          {item.allergens.length > 0 && (
            <View style={{
              backgroundColor: '#fff7ed', borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: '#fed7aa',
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#c2410c', marginBottom: 4 }}>
                {t('item.allergens')}
              </Text>
              <Text style={{ fontSize: 13, color: '#9a3412' }}>
                {item.allergens.join(', ')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom — qty + add to cart */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: Brand.card,
        paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
        borderTopWidth: 1, borderTopColor: Brand.border,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06, shadowRadius: 12, elevation: 10,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* Qty controls */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 0,
            backgroundColor: Brand.orangeLight, borderRadius: 14, overflow: 'hidden',
          }}>
            <TouchableOpacity
              onPress={() => setQty(q => Math.max(1, q - 1))}
              style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 20, color: Brand.orange, fontWeight: '700', lineHeight: 22 }}>−</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '700', color: Brand.textPrimary, minWidth: 28, textAlign: 'center' }}>
              {qty}
            </Text>
            <TouchableOpacity
              onPress={() => setQty(q => q + 1)}
              style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 20, color: Brand.orange, fontWeight: '700', lineHeight: 22 }}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Add to cart button */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              addToCart(item, qty);
              router.push('/cart');
            }}
            style={{
              flex: 1, backgroundColor: Brand.orange, borderRadius: 14,
              height: 44, alignItems: 'center', justifyContent: 'center',
              flexDirection: 'row', gap: 8,
              shadowColor: Brand.orange, shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
              {t('item.addToCart', { total })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
