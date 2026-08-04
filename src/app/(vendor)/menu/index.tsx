import { View, Text, TouchableOpacity, Image, Switch } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { useVendorMenu, toggleAvailability } from '@/lib/vendor-store';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';

export default function VendorMenuScreen() {
  const { t } = useI18n();
  const items = useVendorMenu();

  const comingSoon = () => showAlert(t('common.comingSoonTitle'), t('common.comingSoonMsg'));

  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: Brand.textPrimary }}>{t('vendor.menu.title')}</Text>
          <Text style={{ fontSize: 13, color: '#8A8F9B', marginTop: 2 }}>{t('vendor.menu.subtitle')}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(vendor)/menu/new' as any)}
          style={{ backgroundColor: Brand.orange, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{t('vendor.menu.addNewItem')}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EEF0F5' }}>
        <View style={{ borderBottomWidth: 2, borderBottomColor: Brand.vendorAccent, paddingBottom: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.vendorAccent }}>{t('vendor.menu.allItems')}</Text>
        </View>
      </View>

      {items.length === 0 ? (
        <Text style={{ fontSize: 13, color: '#B0B4BF', paddingVertical: 12 }}>{t('vendor.menu.empty')}</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {items.map(item => (
            <View key={item.id} style={{ width: 220, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#EEF0F5', overflow: 'hidden' }}>
              <View style={{ height: 130, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
                {item.image_url
                  ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <Text style={{ fontSize: 44 }}>🍽️</Text>
                }
                <TouchableOpacity
                  onPress={comingSoon}
                  style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="ellipsis-vertical" size={14} color={Brand.textPrimary} />
                </TouchableOpacity>
              </View>
              <View style={{ padding: 14, gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: Brand.textPrimary }} numberOfLines={2}>{item.name}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: Brand.vendorAccent }}>{item.price}฿</Text>
                </View>
                {item.is_halal && (
                  <View style={{ alignSelf: 'flex-start', backgroundColor: Brand.orangeLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: Brand.orange, letterSpacing: 0.5 }}>{t('common.halal').toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ height: 1, backgroundColor: '#EEF0F5', marginVertical: 2 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#8A8F9B', fontWeight: '600' }}>{t('vendor.menu.availability')}</Text>
                  <Switch
                    value={item.is_available}
                    onValueChange={() => toggleAvailability(item.id)}
                    trackColor={{ false: '#E2E4EC', true: Brand.vendorAccent }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
