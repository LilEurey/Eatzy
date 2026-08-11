import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { getVendorPayments } from '@/lib/vendor-store';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { BANGKOK_TZ, isBangkokToday, formatBangkokDate, isBangkokDateInRange, type DateRangeFilter } from '@/lib/time';
import { PillDropdown } from '@/components/PillDropdown';

function formatDateTime(iso: string, t: ReturnType<typeof useI18n>['t']) {
  const time = new Date(iso).toLocaleTimeString('en-US', { timeZone: BANGKOK_TZ, hour: 'numeric', minute: '2-digit', hour12: true });
  return isBangkokToday(iso) ? `${t('common.today')}, ${time}` : `${formatBangkokDate(iso)}, ${time}`;
}

const TABLE_MIN_WIDTH = 560;

export default function VendorFinanceScreen() {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const tableScrolls = width < TABLE_MIN_WIDTH + 32;
  const payments = getVendorPayments();
  const [historyFilter, setHistoryFilter] = useState<DateRangeFilter>('all');

  const todayPayments = payments.filter(p => isBangkokToday(p.created_at));
  const totalRevenueToday = todayPayments.reduce((sum, p) => sum + p.amount, 0);
  const availableToWithdraw = payments.reduce((sum, p) => sum + p.amount, 0);
  const visiblePayments = payments.filter(p => isBangkokDateInRange(p.created_at, historyFilter));

  const historyFilterOptions: { key: DateRangeFilter; label: string }[] = [
    { key: 'all', label: t('common.allTime') },
    { key: 'today', label: t('common.today') },
    { key: 'week', label: t('common.thisWeek') },
    { key: 'month', label: t('common.thisMonth') },
  ];

  const comingSoon = () => showAlert(t('common.comingSoonTitle'), t('common.comingSoonMsg'));

  return (
    <View style={{ gap: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: Brand.textPrimary }}>{t('vendor.finance.title')}</Text>

      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 200, backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEF0F5' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#8A8F9B', letterSpacing: 0.5 }}>{t('vendor.finance.totalRevenueToday')}</Text>
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: Brand.vendorAccentLight, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="cash-outline" size={14} color={Brand.vendorAccent} />
            </View>
          </View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: Brand.textPrimary }}>฿{totalRevenueToday.toLocaleString()}.00</Text>
        </View>

        <View style={{ flex: 1, minWidth: 200, backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEF0F5' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#8A8F9B', letterSpacing: 0.5 }}>{t('vendor.finance.amountPayment')}</Text>
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="card-outline" size={14} color={Brand.orange} />
            </View>
          </View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: Brand.textPrimary }}>{todayPayments.length}</Text>
        </View>

        <View style={{ flex: 1, minWidth: 220, backgroundColor: Brand.vendorAccent, borderRadius: 16, padding: 18 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5, marginBottom: 14 }}>
            {t('vendor.finance.availableToWithdraw')}
          </Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 14 }}>฿{availableToWithdraw.toLocaleString()}.00</Text>
          <TouchableOpacity onPress={comingSoon} style={{ backgroundColor: '#fff', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: Brand.vendorAccent }}>{t('vendor.finance.withdraw')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#EEF0F5', overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>{t('vendor.finance.paymentHistory')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PillDropdown
              compact
              icon="filter-outline"
              label={historyFilterOptions.find(o => o.key === historyFilter)!.label}
              options={historyFilterOptions}
              selected={historyFilter}
              onSelect={setHistoryFilter}
            />
            <TouchableOpacity onPress={comingSoon} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
              <Ionicons name="download-outline" size={12} color={Brand.textPrimary} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: Brand.textPrimary }}>{t('vendor.finance.export')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {visiblePayments.length === 0 ? (
          <Text style={{ fontSize: 13, color: '#B0B4BF', padding: 18 }}>{t('vendor.finance.empty')}</Text>
        ) : (
          <>
            <ScrollView horizontal={tableScrolls} showsHorizontalScrollIndicator={false}>
              <View style={{ minWidth: tableScrolls ? TABLE_MIN_WIDTH : '100%' }}>
                <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#EEF0F5', paddingHorizontal: 18, paddingVertical: 10 }}>
                  <Text style={{ flex: 2, fontSize: 10.5, fontWeight: '700', color: '#8A8F9B' }}>{t('vendor.finance.colDateTime')}</Text>
                  <Text style={{ flex: 1.4, fontSize: 10.5, fontWeight: '700', color: '#8A8F9B' }}>{t('vendor.finance.colOrder')}</Text>
                  <Text style={{ flex: 1, fontSize: 10.5, fontWeight: '700', color: '#8A8F9B' }}>{t('vendor.finance.colAmount')}</Text>
                  <Text style={{ flex: 1.6, fontSize: 10.5, fontWeight: '700', color: '#8A8F9B' }}>{t('vendor.finance.colMethod')}</Text>
                  <Text style={{ flex: 1.2, fontSize: 10.5, fontWeight: '700', color: '#8A8F9B' }}>{t('vendor.finance.colStatus')}</Text>
                </View>
                {visiblePayments.map(p => (
                  <View key={p.order_id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F5F6F9' }}>
                    <Text style={{ flex: 2, fontSize: 12.5, color: '#4B4F58' }} numberOfLines={1}>{formatDateTime(p.created_at, t)}</Text>
                    <Text style={{ flex: 1.4, fontSize: 12.5, fontWeight: '700', color: Brand.textPrimary }} numberOfLines={1}>{p.display_id}</Text>
                    <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: Brand.textPrimary }} numberOfLines={1}>฿{p.amount.toFixed(2)}</Text>
                    <Text style={{ flex: 1.6, fontSize: 12.5, color: '#4B4F58' }} numberOfLines={1}>{t('vendor.finance.campusWallet')}</Text>
                    <View style={{ flex: 1.2 }}>
                      <View style={{ alignSelf: 'flex-start', backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#16a34a' }}>{t('vendor.finance.completed')}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity onPress={comingSoon} style={{ alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F5F6F9' }}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: Brand.vendorAccent }}>{t('vendor.finance.viewAll')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}
