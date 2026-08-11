import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, useWindowDimensions, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Slot, router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import {
  useVendorOrders, useVendorProfile, useVendorLoading, useStoreOpen,
  setStoreOpen, initVendorSession, signOutVendor,
} from '@/lib/vendor-store';
import { useI18n } from '@/lib/i18n';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
type NavLabelKey = 'vendor.nav.overview' | 'vendor.nav.orders' | 'vendor.nav.menu' | 'vendor.nav.analytics';
type NavItem = { href: string; match: string; icon: IoniconsName; labelKey: NavLabelKey };

const NAV: NavItem[] = [
  { href: '/(vendor)/overview', match: '/overview', icon: 'grid-outline', labelKey: 'vendor.nav.overview' },
  { href: '/(vendor)/orders', match: '/orders', icon: 'cart-outline', labelKey: 'vendor.nav.orders' },
  { href: '/(vendor)/menu', match: '/menu', icon: 'cut-outline', labelKey: 'vendor.nav.menu' },
  { href: '/(vendor)/analytics', match: '/analytics', icon: 'bar-chart-outline', labelKey: 'vendor.nav.analytics' },
];

// Below this width the fixed 220px sidebar leaves too little room for
// content (cards min-width 200-320 start overflowing/overlapping), so
// phones get a bottom tab bar instead — same breakpoint vendor-login.tsx
// uses to decide when there's room for its side-by-side hero panel.
const TABLET_BREAKPOINT = 760;
// Between TABLET_BREAKPOINT and this width there's room for a bottom tab
// bar's worth of nav but not a permanent 220px sidebar without squeezing
// content, so this range gets a hamburger-triggered overlay drawer instead.
const DESKTOP_BREAKPOINT = 1024;

function NavRow({ item, active, badge, onPress }: { item: NavItem; active: boolean; badge: number; onPress: () => void }) {
  const { t } = useI18n();
  return (
    <TouchableOpacity
      onPress={onPress}
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
      {item.labelKey === 'vendor.nav.orders' && badge > 0 && (
        <View style={{ backgroundColor: Brand.orange, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function SidebarBody({ pathname, activeCount, onNavigate }: { pathname: string; activeCount: number; onNavigate: (href: string) => void }) {
  const { t } = useI18n();
  return (
    <View style={{ flex: 1, justifyContent: 'space-between' }}>
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
              <NavRow key={item.href} item={item} active={active} badge={activeCount} onPress={() => onNavigate(item.href)} />
            );
          })}
        </View>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: '#EEF0F5', paddingTop: 8 }}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 8 }}
        >
          <Ionicons name="help-circle-outline" size={18} color="#8A8F9B" />
          <Text style={{ fontSize: 13, color: '#4B4F58', fontWeight: '500' }}>{t('vendor.nav.helpCenter')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => signOutVendor().then(() => router.replace('/vendor-login' as any))}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 8 }}
        >
          <Ionicons name="log-out-outline" size={18} color="#8A8F9B" />
          <Text style={{ fontSize: 13, color: '#4B4F58', fontWeight: '500' }}>{t('vendor.nav.logOut')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function BottomTabBar({ pathname, badge }: { pathname: string; badge: number }) {
  const { t } = useI18n();
  return (
    <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#EEF0F5' }}>
      <View style={{ flexDirection: 'row', paddingTop: 8 }}>
        {NAV.map(item => {
          const active = pathname === item.match || pathname.startsWith(item.match + '/');
          return (
            <TouchableOpacity
              key={item.href}
              onPress={() => router.push(item.href as any)}
              style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6 }}
            >
              <View>
                <Ionicons name={item.icon} size={22} color={active ? Brand.vendorAccent : '#8A8F9B'} />
                {item.labelKey === 'vendor.nav.orders' && badge > 0 && (
                  <View style={{
                    position: 'absolute', top: -4, right: -8, backgroundColor: Brand.orange, borderRadius: 8,
                    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{badge}</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 10.5, fontWeight: active ? '700' : '500', color: active ? Brand.vendorAccent : '#8A8F9B' }}>
                {t(item.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function VendorLayout() {
  const { t } = useI18n();
  const pathname = usePathname();
  const orders = useVendorOrders();
  const storeOpen = useStoreOpen();
  const vendor = useVendorProfile();
  const loading = useVendorLoading();
  const initStarted = useRef(false);
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;
    initVendorSession().then(result => {
      if (result !== 'ok') router.replace('/vendor-login' as any);
    });
  }, []);

  const activeCount = orders.filter(o => o.status === 'pending' || o.status === 'accepted').length;

  if (loading || !vendor) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F5F9', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Brand.vendorAccent} size="large" />
      </SafeAreaView>
    );
  }

  const topbar = (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: isTablet ? 24 : 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#EEF0F5', backgroundColor: '#fff',
    }}>
      {isTablet && !isDesktop && (
        <TouchableOpacity
          onPress={() => setDrawerOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginRight: 14 }}
        >
          <Ionicons name="menu-outline" size={24} color={Brand.textPrimary} />
        </TouchableOpacity>
      )}
      <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: Brand.textPrimary }} numberOfLines={1}>{vendor?.name ?? ''}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: isTablet ? 14 : 10 }}>
        <TouchableOpacity
          onPress={() => setStoreOpen(!storeOpen)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 50, paddingHorizontal: 12, paddingVertical: 7,
          }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: storeOpen ? '#22c55e' : '#ef4444' }} />
          {isTablet && (
            <Text style={{ fontSize: 12, fontWeight: '600', color: Brand.textPrimary }}>
              {storeOpen ? t('vendor.topbar.storeOpen') : t('vendor.topbar.storeClosed')}
            </Text>
          )}
          <Ionicons name="chevron-down" size={12} color="#8A8F9B" />
        </TouchableOpacity>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: Brand.vendorAccent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
            {(vendor?.name ?? 'V').charAt(0).toUpperCase()}
          </Text>
        </View>
        {!isDesktop && (
          <TouchableOpacity
            onPress={() => signOutVendor().then(() => router.replace('/vendor-login' as any))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="log-out-outline" size={20} color="#8A8F9B" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const content = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: isTablet ? 24 : 16 }} showsVerticalScrollIndicator={false}>
      <Slot />
    </ScrollView>
  );

  if (!isTablet) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F5F9' }} edges={['top']}>
        <View style={{ flex: 1 }}>
          {topbar}
          {content}
          <BottomTabBar pathname={pathname} badge={activeCount} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isDesktop) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F5F9' }} edges={['top', 'bottom']}>
        <View style={{ flex: 1 }}>
          {topbar}
          {content}
        </View>
        <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ width: 260, backgroundColor: '#fff', paddingVertical: 20 }}>
              <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
                <SidebarBody
                  pathname={pathname}
                  activeCount={activeCount}
                  onNavigate={(href) => { setDrawerOpen(false); router.push(href as any); }}
                />
              </SafeAreaView>
            </View>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setDrawerOpen(false)} />
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F4F5F9' }} edges={['top', 'bottom']}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Sidebar */}
        <View style={{ width: 220, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#EEF0F5', paddingVertical: 20 }}>
          <SidebarBody pathname={pathname} activeCount={activeCount} onNavigate={(href) => router.push(href as any)} />
        </View>

        {/* Main column */}
        <View style={{ flex: 1 }}>
          {topbar}
          {content}
        </View>
      </View>
    </SafeAreaView>
  );
}
