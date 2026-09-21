import type { ReactNode } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Tap } from '@/components/Tap';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { usePreferences, matchAllergens } from '@/hooks/usePreferences';

// Small red pill shown on a menu card when the dish carries an allergen the
// student listed. Same "warn, don't hide" treatment as search.tsx. Sections
// fed by edge functions (recommend-for-you, similar) have no allergens field,
// so they can't show it — a known gap, not a bug.
export function AllergenPill({ allergens }: { allergens: string[] | null }) {
  const { t } = useI18n();
  const { prefs } = usePreferences();
  if (matchAllergens(allergens, prefs).length === 0) return null;
  return (
    <View style={{ backgroundColor: '#fee2e2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6 }}>
      <Text style={{ fontSize: 10, color: '#b91c1c', fontWeight: '700' }}>{t('search.containsAllergen')}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: 24, fontWeight: '700', color: '#261812', marginBottom: 16 }}>{children}</Text>;
}

export function EmptyCard({ text, marginBottom }: { text: string; marginBottom?: number }) {
  return (
    <View style={{
      borderRadius: 24, backgroundColor: Brand.card, height: 120,
      alignItems: 'center', justifyContent: 'center', marginBottom,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8,
    }}>
      <Text style={{ color: Brand.textSecondary }}>{text}</Text>
    </View>
  );
}

// Titled horizontal scroller. With an emptyText the section always renders
// (showing the empty card when count is 0); without one an empty section is
// hidden entirely.
export function CardRow({ title, count, emptyText, children }: { title: string; count: number; emptyText?: string; children: ReactNode }) {
  if (count === 0 && !emptyText) return null;
  return (
    <View style={{ marginBottom: 28 }}>
      <SectionTitle>{title}</SectionTitle>
      {count > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {children}
        </ScrollView>
      ) : (
        <EmptyCard text={emptyText!} />
      )}
    </View>
  );
}

type ItemCardProps = {
  itemId: string;
  // Recommendation rows append ?rec=1 → item/[id] logs the view as
  // was_recommended, so ml_interactions can tell a recommended tap from a browse.
  recommended?: boolean;
  imageUrl: string | null;
  emoji?: string;
  badge?: ReactNode;
  title: string;
  vendorName: string;
  price: number;
  // Omit for rows that carry no allergen data (edge-function sections).
  allergens?: string[] | null;
};

export function ItemCard({ itemId, recommended, imageUrl, emoji = '🍽️', badge, title, vendorName, price, allergens }: ItemCardProps) {
  return (
    <Tap
      onPress={() => (recommended ? router.push(`/item/${itemId}?rec=1`) : router.push(`/item/${itemId}`))}
      activeOpacity={0.85}
      style={{
        width: 150, borderRadius: 24, backgroundColor: Brand.card, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.04, shadowRadius: 30, elevation: 2,
      }}
    >
      <View style={{ height: 130, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
        {imageUrl
          ? <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          : <Text style={{ fontSize: 36 }}>{emoji}</Text>
        }
        {badge}
      </View>
      <View style={{ padding: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#261812' }} numberOfLines={2}>
          {title}
        </Text>
        <Text style={{ fontSize: 11, color: '#5a4136', marginBottom: 4 }} numberOfLines={1}>
          {vendorName}
        </Text>
        {allergens !== undefined && <AllergenPill allergens={allergens} />}
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#a04100' }}>฿{price}</Text>
      </View>
    </Tap>
  );
}
