import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Image, TextInput, ActivityIndicator } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { MOCK_MENU_ITEMS, getVendorName } from '@/lib/mock-data';
import { useI18n, type TranslationKey } from '@/lib/i18n';

type SearchItem = {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  spice_level: number;
  is_available: boolean;
  is_halal: boolean;
  is_vegetarian: boolean;
  is_jay: boolean;
  allergens: string[];
  tags: string[];
  ingredients: string[];
  image_url: string | null;
  vendorName: string;
};

const DIET_FILTERS = ['Halal', 'Vegetarian', 'Jay'] as const;
type DietFilter = (typeof DIET_FILTERS)[number];
const DIET_LABEL: Record<DietFilter, TranslationKey> = {
  Halal: 'onboarding.dietary.halal',
  Vegetarian: 'onboarding.dietary.vegetarian',
  Jay: 'onboarding.dietary.jay',
};
const DIET_FIELD: Record<DietFilter, keyof SearchItem> = {
  Halal: 'is_halal',
  Vegetarian: 'is_vegetarian',
  Jay: 'is_jay',
};

// Ranked substring search: name hits outrank description/tag/ingredient/vendor
// hits, and a name that starts with the query outranks a name that merely
// contains it — keeps the top results the ones a student actually meant.
function matchScore(item: SearchItem, needle: string): number {
  if (!needle) return 1;
  const name = item.name.toLowerCase();
  if (name === needle) return 100;
  if (name.startsWith(needle)) return 90;
  if (name.includes(needle)) return 70;
  if (item.category?.toLowerCase().includes(needle)) return 50;
  if (item.tags.some(tag => tag.toLowerCase().includes(needle))) return 45;
  if (item.vendorName.toLowerCase().includes(needle)) return 40;
  if (item.ingredients.some(ing => ing.toLowerCase().includes(needle))) return 30;
  if (item.description?.toLowerCase().includes(needle)) return 20;
  return 0;
}

function spiceDots(level: number) {
  return level === 0 ? '' : ' · ' + '🌶'.repeat(level);
}

export default function SearchScreen() {
  const { t } = useI18n();
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [diet, setDiet] = useState<Set<DietFilter>>(new Set());

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('menu_items')
        .select('id,vendor_id,name,description,price,category,spice_level,is_available,is_halal,is_vegetarian,is_jay,allergens,tags,ingredients,image_url,vendors(name)')
        .eq('is_available', true);

      const dbItems = (data ?? []) as unknown as (SearchItem & { vendors: { name: string } | null })[];
      if (dbItems.length) {
        setItems(dbItems.map(i => ({ ...i, vendorName: i.vendors?.name ?? '' })));
      } else {
        setItems(
          MOCK_MENU_ITEMS.filter(i => i.is_available).map(i => ({
            ...i,
            vendorName: getVendorName(i.vendor_id),
          })),
        );
      }
      setLoading(false);
    }
    void load();
  }, []);

  function toggleDiet(f: DietFilter) {
    setDiet(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  }

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter(item => [...diet].every(f => item[DIET_FIELD[f]] === true))
      .map(item => ({ item, score: matchScore(item, needle) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }, [items, query, diet]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav + search field */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Tap onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={Brand.textPrimary} />
          </Tap>
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center',
            backgroundColor: 'rgba(248,221,210,0.5)', borderRadius: 16, paddingHorizontal: 14,
          }}>
            <Ionicons name="search" size={16} color={Brand.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('search.placeholder')}
              placeholderTextColor="#5a4136"
              autoFocus
              style={{ flex: 1, fontSize: 16, color: '#261812', paddingVertical: 14, paddingHorizontal: 10 }}
            />
            {query.length > 0 && (
              <Tap onPress={() => setQuery('')} haptic={false}>
                <Ionicons name="close-circle" size={18} color={Brand.textSecondary} />
              </Tap>
            )}
          </View>
        </View>

        {/* Dietary filter chips */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {DIET_FILTERS.map(f => {
            const selected = diet.has(f);
            return (
              <Tap
                key={f}
                onPress={() => toggleDiet(f)}
                haptic={false}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 50,
                  backgroundColor: selected ? Brand.orange : Brand.card,
                  borderWidth: 1.5, borderColor: selected ? Brand.orange : Brand.border,
                }}
              >
                <Text style={{ color: selected ? '#fff' : Brand.textPrimary, fontWeight: '600', fontSize: 13 }}>
                  {t(DIET_LABEL[f])}
                </Text>
              </Tap>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Brand.orange} size="large" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: Brand.textSecondary, fontSize: 13, marginBottom: 12 }}>
            {t('search.resultsCount', { n: results.length })}
          </Text>

          <View style={{ gap: 12 }}>
            {results.map(item => (
              <Tap
                key={item.id}
                onPress={() => router.push(`/item/${item.id}`)}
                activeOpacity={0.85}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  backgroundColor: Brand.card, borderRadius: 20, padding: 12,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.04, shadowRadius: 20, elevation: 2,
                }}
              >
                <View style={{
                  width: 60, height: 60, borderRadius: 12, overflow: 'hidden',
                  backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.image_url
                    ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    : <Text style={{ fontSize: 26 }}>🍽️</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#261812' }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#5a4136', marginTop: 2 }} numberOfLines={1}>
                    {item.vendorName}{item.category ? ` · ${item.category}` : ''}{spiceDots(item.spice_level)}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                    {item.is_halal && (
                      <View style={{ backgroundColor: '#ffeae1', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color: '#565656' }}>{t('common.halal')}</Text>
                      </View>
                    )}
                    {item.is_vegetarian && (
                      <View style={{ backgroundColor: '#ffeae1', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color: '#565656' }}>{t('common.vegetarian')}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#a04100' }}>
                  ฿{item.price}
                </Text>
              </Tap>
            ))}

            {results.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>🔍</Text>
                <Text style={{ color: Brand.textSecondary, textAlign: 'center' }}>{t('search.noResults')}</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
