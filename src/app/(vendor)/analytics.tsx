import { useState } from 'react';
import { Platform, View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { Tap } from '@/components/Tap';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { useVendorPayments } from '@/lib/vendor-store';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { showAlert, errorMessage } from '@/lib/alert';
import { router } from 'expo-router';
import { paymentsCsv } from '@/lib/payments-csv';
import { useI18n } from '@/lib/i18n';
import { isBangkokToday, isBangkokDateInRange, formatFriendlyDateTime, type DateRangeFilter } from '@/lib/time';
import { PillDropdown } from '@/components/PillDropdown';
import { supabase } from '@/lib/supabase';
import { formatBaht } from '@/lib/money';
import { useLiveWhileFocused } from '@/hooks/useLiveWhileFocused';

const TABLE_MIN_WIDTH = 560;

export default function VendorFinanceScreen() {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const tableScrolls = width < TABLE_MIN_WIDTH + 32;
  const payments = useVendorPayments();
  const [historyFilter, setHistoryFilter] = useState<DateRangeFilter>('all');

  const todayPayments = payments.filter(p => isBangkokToday(p.created_at));
  const totalRevenueToday = todayPayments.reduce((sum, p) => sum + p.amount, 0);
  // The vendor's in-app balance is "earned, not yet paid out": credited by
  // finalize_order_handoff, debited by record_vendor_payout when the Stripe
  // transfer lands — not the lifetime sum of completed orders.
  const [availableToWithdraw, setAvailableToWithdraw] = useState<number | null>(null);
  useLiveWhileFocused(async isCancelled => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || isCancelled()) return;
    const { data, error } = await supabase.from('users').select('wallet_balance').eq('id', user.id).maybeSingle();
    if (!isCancelled() && !error && data) setAvailableToWithdraw(data.wallet_balance);
  });
  const visiblePayments = payments.filter(p => isBangkokDateInRange(p.created_at, historyFilter));

  const historyFilterOptions: { key: DateRangeFilter; label: string }[] = [
    { key: 'all', label: t('common.allTime') },
    { key: 'today', label: t('common.today') },
    { key: 'week', label: t('common.thisWeek') },
    { key: 'month', label: t('common.thisMonth') },
  ];

  const exportCsv = async () => {
    const csv = paymentsCsv(visiblePayments);
    const name = `eatzy-payments-${historyFilter}-${new Date().toISOString().slice(0, 10)}.csv`;
    try {
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 0);
        return;
      }
      const file = new File(Paths.cache, name);
      file.create({ overwrite: true });
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
    } catch (e) {
      showAlert(t('vendor.finance.export'), errorMessage(e));
    }
  };

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
          <Text style={{ fontSize: 24, fontWeight: '800', color: Brand.textPrimary }}>฿{formatBaht(totalRevenueToday)}</Text>
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
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 14 }}>{availableToWithdraw == null ? '—' : `฿${formatBaht(availableToWithdraw)}`}</Text>
          <Tap onPress={() => router.push('/(vendor)/profile')} style={{ backgroundColor: '#fff', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: Brand.vendorAccent }}>{t('vendor.finance.withdraw')}</Text>
          </Tap>
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
            <Tap onPress={exportCsv} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
              <Ionicons name="download-outline" size={12} color={Brand.textPrimary} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: Brand.textPrimary }}>{t('vendor.finance.export')}</Text>
            </Tap>
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
                    <Text style={{ flex: 2, fontSize: 12.5, color: '#4B4F58' }} numberOfLines={1}>{formatFriendlyDateTime(p.created_at, t('common.today'))}</Text>
                    <Text style={{ flex: 1.4, fontSize: 12.5, fontWeight: '700', color: Brand.textPrimary }} numberOfLines={1}>{p.display_id}</Text>
                    <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: Brand.textPrimary }} numberOfLines={1}>฿{formatBaht(p.amount)}</Text>
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
          </>
        )}
      </View>
    </View>
  );
}
