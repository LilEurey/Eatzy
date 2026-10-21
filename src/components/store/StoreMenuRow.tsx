import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Tap } from '@/components/Tap';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';
import type { Database } from '@/types/database.types';

export type StoreMenuItem = Pick<Database['public']['Tables']['menu_items']['Row'], 'id' | 'category' | 'name' | 'name_th' | 'description' | 'description_th' | 'price' | 'spice_level' | 'image_url' | 'allergens' | 'is_halal' | 'is_vegetarian' | 'is_jay' | 'is_available'>;

function SpiceIcons({ level }: { level: number }) {
  return Array.from({ length: level }).map((_, i) => (
    <Image key={i} source={require('../../../assets/images/chili.png')} style={{ width: 18, height: 18 }} />
  ));
}

type Props = {
  item: StoreMenuItem;
  highlighted: boolean;
  hasAllergen: boolean;
  onPress: () => void;
};

export function StoreMenuRow({ item, highlighted, hasAllergen, onPress }: Props) {
  const { t, locale } = useI18n();
  return (
    <Tap
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: Brand.card, borderRadius: 20, padding: 14,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
        // Sold out stays tappable (details still useful); the item
        // page blocks Add to Cart.
        opacity: item.is_available ? 1 : 0.5,
        borderWidth: 2, borderColor: highlighted ? Brand.orange : 'transparent',
      }}
    >
      {/* Image */}
      <View style={{
        width: 80, height: 80, borderRadius: 14,
        backgroundColor: Brand.orangeLight, overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {item.image_url
          ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
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
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          {item.is_halal && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#d1fae5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Image source={require('../../../assets/images/halal.png')} style={{ width: 18, height: 18 }} />
              <Text style={{ fontSize: 13, color: '#065f46', fontWeight: '600' }}>{t('common.halal')}</Text>
            </View>
          )}
          {item.is_vegetarian && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dcfce7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Image source={require('../../../assets/images/vegetarian.png')} style={{ width: 18, height: 18 }} />
              <Text style={{ fontSize: 13, color: '#166534', fontWeight: '600' }}>{t('store.veg')}</Text>
            </View>
          )}
          {item.is_jay && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fef9c3', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Image source={require('../../../assets/images/jay.png')} style={{ width: 18, height: 18 }} />
              <Text style={{ fontSize: 13, color: '#854d0e', fontWeight: '600' }}>{t('common.jay')}</Text>
            </View>
          )}
          {item.spice_level > 0 && (
            <View style={{ flexDirection: 'row', backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <SpiceIcons level={item.spice_level} />
            </View>
          )}
          {hasAllergen && (
            <View style={{ backgroundColor: '#fee2e2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 13, color: '#b91c1c', fontWeight: '700' }}>{t('search.containsAllergen')}</Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#a04100', fontVariant: ['tabular-nums'] }}>
            ฿{item.price}
          </Text>
          {item.is_available ? (
            <View style={{
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 18, color: Brand.orange, lineHeight: 20 }}>+</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: Brand.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: Brand.textSecondary }}>{t('store.soldOut')}</Text>
            </View>
          )}
        </View>
      </View>
    </Tap>
  );
}
