import { View, Text, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import Animated from 'react-native-reanimated';
import { router } from 'expo-router';
import { rowEnter } from '@/lib/motion';
import { Tap } from '@/components/Tap';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';

export type SimilarItem = { id: string; name: string; name_th: string | null; price: number; image_url: string | null; vendor_id?: string; vendor_name: string; score: number };

/** Similar Foods — content-based (TF-IDF + cosine over ingredients/tags/category). */
export function SimilarFoods({ items }: { items: SimilarItem[] }) {
  const { t, locale } = useI18n();
  if (items.length === 0) return null;
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: Brand.textPrimary, marginBottom: 12 }}>
        {t('item.similarFoods')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {items.map((s, si) => (
          <Animated.View key={s.id} entering={rowEnter(si)}>
          <Tap
            onPress={() => router.replace(`/item/${s.id}?rec=1&sim=1`)}
            activeOpacity={0.85}
            style={{
              width: 140, borderRadius: 20, backgroundColor: Brand.card, overflow: 'hidden',
              shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.04, shadowRadius: 16, elevation: 2,
            }}
          >
            <View style={{ height: 120, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
              {s.image_url
                ? <Image source={{ uri: s.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
                : <Text style={{ fontSize: 32 }}>🍽️</Text>
              }
            </View>
            <View style={{ padding: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#261812' }} numberOfLines={2}>{localizedText(s.name, s.name_th, locale)}</Text>
              <Text style={{ fontSize: 11, color: '#5a4136', marginBottom: 4 }} numberOfLines={1}>{s.vendor_name}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#a04100', fontVariant: ['tabular-nums'] }}>฿{s.price}</Text>
            </View>
          </Tap>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}
