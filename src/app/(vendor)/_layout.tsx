import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Slot, router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { getVendorById, MOCK_VENDOR_SESSION } from '@/lib/mock-data';
import { useVendorOrders, useStoreOpen, setStoreOpen } from '@/lib/vendor-store';
import { useI18n } from '@/lib/i18n';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const NAV: { href: string; match: string; icon: IoniconsName; labelKey: 'vendor.nav.overview' | 'vendor.nav.orders' | 'vendor.nav.menu' | 'vendor.nav.analytics' }[] = [
  { href: '/(vendor)/overview', match: '/overview', icon: 'grid-outline', labelKey: 'vendor.nav.overview' },
  { href: '/(vendor)/orders', match: '/orders', icon: 'cart-outline', labelKey: 'vendor.nav.orders' },
  { href: '/(vendor)/menu', match: '/menu', icon: 'cut-outline', labelKey: 'vendor.nav.menu' },
  { href: '/(vendor)/analytics', match: '/analytics', icon: 'bar-chart-outline', labelKey: 'vendor.nav.analytics' },
];

export default function VendorLayout() {
  const { t } = useI18n();
  const pathname = usePathname();
  const orders = useVendorOrders();
  const storeOpen = useStoreOpen();
  const vendor = getVendorById(MOCK_VENDOR_SESSION.vendorId);

  const activeCount = orders.filter(o => o.status === 'pending' || o.status === 'accepted').length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F5F9' }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Sidebar */}
        <View style={{ width: 220, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#EEF0F5', paddingVertical: 20, justifyContent: 'space-between' }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginBottom: 28 }}>
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: Brand.vendorAccent, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="restaurant" size={16} color="#fff" />
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: Brand.vendorAccent }}>{t('vendor.login.brand')}</Text>
                <Text style={{ fontSize: 9, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.6 }}>{t('vendor.portalLabel')}</Text>
              </View>
            </View>

            <View style={{ gap: 2, paddingHorizontal: 12 }}>
              {NAV.map(item => {
                const active = pathname === item.match || pathname.startsWith(item.match + '/');
                return (
                  <TouchableOpacity
                    key={item.href}
                    onPress={() => router.push(item.href as any)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10,
                      backgroundColor: active ? Brand.vendorAccentLight : 'transparent',
                    }}
                  >
                    <Ionicons name={item.icon} size={18} color={active ? Brand.vendorAccent : '#8A8F9B'} />
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: active ? '700' : '500', color: active ? Brand.vendorAccent : '#4B4F58' }}>
                      {t(item.labelKey)}
                    </Text>
                    {item.labelKey === 'vendor.nav.orders' && activeCount > 0 && (
                      <View style={{ backgroundColor: Brand.orange, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{activeCount}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            onPress={() => router.push('/(auth)' as any)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#EEF0F5' }}
          >
            <Ionicons name="help-circle-outline" size={18} color="#8A8F9B" />
            <Text style={{ fontSize: 13, color: '#4B4F58', fontWeight: '500' }}>{t('vendor.nav.helpCenter')}</Text>
          </TouchableOpacity>
        </View>

        {/* Main column */}
        <View style={{ flex: 1 }}>
          {/* Topbar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#EEF0F5', backgroundColor: '#fff',
          }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: Brand.textPrimary }}>{vendor?.name ?? ''}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {/* ponytail: real vendors.update({is_open}) call belongs on this toggle. */}
              <TouchableOpacity
                onPress={() => setStoreOpen(!storeOpen)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 7,
                }}
              >
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: storeOpen ? '#22c55e' : '#ef4444' }} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: Brand.textPrimary }}>
                  {storeOpen ? t('vendor.topbar.storeOpen') : t('vendor.topbar.storeClosed')}
                </Text>
                <Ionicons name="chevron-down" size={12} color="#8A8F9B" />
              </TouchableOpacity>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: Brand.vendorAccent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                  {(vendor?.name ?? 'V').charAt(0).toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            <Slot />
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}
