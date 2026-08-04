import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { useVendorOrders, useVendorProfile } from '@/lib/vendor-store';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';

// Decorative — illustrative hourly sales shape, not backed by real interaction data.
const SALES_VELOCITY = [
  { label: '10AM', value: 30 }, { label: '11AM', value: 45 }, { label: '12PM', value: 90, highlight: 'accent' as const },
  { label: '1PM', value: 55 }, { label: '2PM', value: 35 }, { label: '3PM', value: 65 },
  { label: '4PM', value: 50 }, { label: '5PM', value: 95, highlight: 'orange' as const },
  { label: '6PM', value: 60 }, { label: '7PM', value: 70 },
];

// Decorative — illustrative traffic intensity grid, not backed by real interaction data.
const HEATMAP_ROWS = [
  [0.2, 0.25, 0.55, 0.9, 0.75, 0.3],
  [0.15, 0.2, 0.35, 0.85, 0.8, 0.4],
  [0.05, 0.15, 0.3, 0.5, 0.55, 0.35],
];

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEF0F5' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#8A8F9B', letterSpacing: 0.5 }}>{label}</Text>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: Brand.vendorAccentLight, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={14} color={Brand.vendorAccent} />
        </View>
      </View>
      <Text style={{ fontSize: 24, fontWeight: '800', color: Brand.textPrimary, marginBottom: 4 }}>{value}</Text>
      {sub && <Text style={{ fontSize: 11.5, color: '#8A8F9B' }}>{sub}</Text>}
    </View>
  );
}

export default function VendorOverviewScreen() {
  const { t } = useI18n();
  const orders = useVendorOrders();
  const vendor = useVendorProfile();

  const totalOrders = orders.length;
  const revenueToday = orders
    .filter(o => o.status !== 'rejected' && o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total_amount, 0);
  const activeQueue = orders.filter(o => o.status === 'pending' || o.status === 'accepted').length;
  const queueCapacity = 20;
  const avgPrep = vendor?.estimated_wait_min ?? 0;

  const comingSoon = () => showAlert(t('common.comingSoonTitle'), t('common.comingSoonMsg'));

  return (
    <View style={{ gap: 20 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: Brand.textPrimary }}>{t('vendor.overview.title')}</Text>
          <Text style={{ fontSize: 13, color: '#8A8F9B', marginTop: 2 }}>{t('vendor.overview.subtitle')}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={comingSoon} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#fff' }}>
            <Ionicons name="calendar-outline" size={14} color={Brand.textPrimary} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary }}>{t('vendor.overview.today')}</Text>
            <Ionicons name="chevron-down" size={12} color="#8A8F9B" />
          </TouchableOpacity>
          <TouchableOpacity onPress={comingSoon} style={{ backgroundColor: Brand.orange, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{t('vendor.overview.downloadReport')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stat cards */}
      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        <StatCard label={t('vendor.overview.totalOrders')} value={String(totalOrders)} sub={t('vendor.overview.vsYesterday')} icon="bag-handle-outline" />
        <StatCard label={t('vendor.overview.revenueToday')} value={`฿${revenueToday.toLocaleString()}`} sub={t('vendor.overview.vsYesterday')} icon="cash-outline" />
        <View style={{ flex: 1, minWidth: 180, backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEF0F5' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#8A8F9B', letterSpacing: 0.5 }}>{t('vendor.overview.activeQueue')}</Text>
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="list-outline" size={14} color={Brand.orange} />
            </View>
          </View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: Brand.textPrimary, marginBottom: 8 }}>
            {activeQueue} <Text style={{ fontSize: 12, fontWeight: '600', color: '#8A8F9B' }}>{t('vendor.overview.ordersPrep')}</Text>
          </Text>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: '#F0F1F5', overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, (activeQueue / queueCapacity) * 100)}%`, height: '100%', backgroundColor: Brand.orange, borderRadius: 3 }} />
          </View>
        </View>
        <StatCard label={t('vendor.overview.avgPrepTime')} value={`${avgPrep}m`} icon="time-outline" />
      </View>

      {/* Sales velocity + heatmap */}
      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        <View style={{ flex: 2, minWidth: 320, backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#EEF0F5' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>{t('vendor.overview.salesVelocity')}</Text>
            <TouchableOpacity onPress={comingSoon} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: Brand.textPrimary }}>{t('vendor.overview.today')}</Text>
              <Ionicons name="chevron-down" size={11} color="#8A8F9B" />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 140 }}>
            {SALES_VELOCITY.map(bar => (
              <View key={bar.label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <View style={{
                  width: '100%', height: `${bar.value}%`, borderRadius: 6,
                  backgroundColor: bar.highlight === 'accent' ? Brand.vendorAccent : bar.highlight === 'orange' ? Brand.orange : '#EEF0F5',
                }} />
                <Text style={{ fontSize: 9, color: '#8A8F9B' }}>{bar.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 220, backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#EEF0F5' }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary, marginBottom: 16 }}>{t('vendor.overview.trafficHeatmap')}</Text>
          <View style={{ gap: 6 }}>
            {HEATMAP_ROWS.map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
                {row.map((intensity, j) => (
                  <View key={j} style={{
                    flex: 1, aspectRatio: 1.4, borderRadius: 6,
                    backgroundColor: `rgba(108,99,255,${intensity})`,
                  }} />
                ))}
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={{ fontSize: 10, color: '#8A8F9B' }}>{t('vendor.overview.morning')}</Text>
            <Text style={{ fontSize: 10, color: '#8A8F9B' }}>{t('vendor.overview.lunch')}</Text>
            <Text style={{ fontSize: 10, color: '#8A8F9B' }}>{t('vendor.overview.evening')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
