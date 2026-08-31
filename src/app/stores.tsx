import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Image, TextInput, ActivityIndicator } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { useFocusGuard } from '@/hooks/useFocusGuard';

type Vendor = {
  id: string;
  name: string;
  is_open: boolean | null;
  is_halal_certified: boolean | null;
  current_queue_count: number | null;
  estimated_wait_min: number | null;
  cuisine_tags: string[] | null;
  cover_image_url: string | null;
};

const VENDOR_FIELDS =
  'id,name,is_open,is_halal_certified,current_queue_count,estimated_wait_min,cuisine_tags,cover_image_url';

export default function StoresScreen() {
  const { t } = useI18n();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [halalOnly, setHalalOnly] = useState(false);
  const cancelledRef = useFocusGuard();

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('vendors')
        .select(VENDOR_FIELDS)
        .order('is_open', { ascending: false })
        .order('current_queue_count', { ascending: true })
        .then(({ data, error }) => {
          if (cancelledRef.current) return;
          setVendors(error || !data ? [] : (data as unknown as Vendor[]));
          setLoading(false);
        });
    }, [cancelledRef])
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return vendors
      .filter(v => !halalOnly || v.is_halal_certified === true)
      .filter(v => !needle || v.name.toLowerCase().includes(needle));
  }, [vendors, query, halalOnly]);

  function statusLine(v: Vendor): string {
    if (v.is_open !== true) return t('stores.closed');
    if ((v.current_queue_count ?? 0) === 0 || !v.estimated_wait_min) return t('stores.noQueue');
    return t('stores.waitMin', { n: v.estimated_wait_min });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav + search field */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Tap onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={Brand.textPrimary} />
          </Tap>
          <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>
            {t('stores.title')}
          </Text>
        </View>

        <View style={{
          flexDirection: 'row', alignItems: 'center', marginTop: 12,
          backgroundColor: 'rgba(248,221,210,0.5)', borderRadius: 16, paddingHorizontal: 14,
        }}>
          <Ionicons name="search" size={16} color={Brand.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('stores.searchPlaceholder')}
            placeholderTextColor="#5a4136"
            style={{ flex: 1, fontSize: 16, color: '#261812', paddingVertical: 14, paddingHorizontal: 10 }}
          />
          {query.length > 0 && (
            <Tap onPress={() => setQuery('')} haptic={false}>
              <Ionicons name="close-circle" size={18} color={Brand.textSecondary} />
            </Tap>
          )}
        </View>

        {/* Halal filter chip */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Tap
            onPress={() => setHalalOnly(v => !v)}
            haptic={false}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 50,
              backgroundColor: halalOnly ? Brand.orange : Brand.card,
              borderWidth: 1.5, borderColor: halalOnly ? Brand.orange : Brand.border,
            }}
          >
            <Text style={{ color: halalOnly ? '#fff' : Brand.textPrimary, fontWeight: '600', fontSize: 13 }}>
              {t('stores.halalFilter')}
            </Text>
          </Tap>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Brand.orange} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ color: Brand.textSecondary, fontSize: 13, marginBottom: 12 }}>
            {t('stores.resultsCount', { n: results.length })}
          </Text>

          <View style={{ gap: 12 }}>
            {results.map(vendor => (
              <Tap
                key={vendor.id}
                onPress={() => router.push(`/store/${vendor.id}`)}
                activeOpacity={0.85}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 16,
                  backgroundColor: Brand.card, borderRadius: 24, padding: 12,
                  opacity: vendor.is_open === true ? 1 : 0.5,
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
                    : <Text style={{ fontSize: 28 }}>🏪</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#261812', marginBottom: 2 }}>
                    {vendor.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#5a4136', marginBottom: 6 }}>
                    {vendor.cuisine_tags?.[0] ?? t('home.thaiFood')}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={{
                      backgroundColor: vendor.is_open === true ? '#e7f5e9' : '#e7ded9',
                      borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
                    }}>
                      <Text style={{ fontSize: 10, color: '#565656' }}>{statusLine(vendor)}</Text>
                    </View>
                    {vendor.is_halal_certified === true && (
                      <View style={{ backgroundColor: '#ffeae1', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color: '#565656' }}>{t('common.halal')}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Tap>
            ))}

            {results.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>🏪</Text>
                <Text style={{ color: Brand.textSecondary, textAlign: 'center' }}>{t('stores.noneFound')}</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
