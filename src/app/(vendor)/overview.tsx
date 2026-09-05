import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Tap } from '@/components/Tap';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { useVendorOrders, useVendorProfile, useVendorMenu } from '@/lib/vendor-store';
import { salesVelocity, busyGrid, itemSales, periodDelta, avgFulfilmentMinutes, type PeriodDelta } from '@/lib/vendor-analytics';
import { comingSoonAlert } from '@/lib/alert';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';
import { isBangkokDateInRange, type DateRangeFilter } from '@/lib/time';
import { PillDropdown } from '@/components/PillDropdown';

// 0 = Monday … 6 = Sunday, matching lib/time bangkokWeekday / vendor-analytics.
const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

// "09:00:00" / "9:00" -> 9; anything unparseable -> fallback.
function parseHour(value: string | null, fallback: number): number {
  const h = Number(String(value ?? '').split(':')[0]);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : fallback;
}

// Real period-over-period change: green up, red down, grey flat. null hides it.
const DELTA_STYLE = {
  up: { color: '#16a34a', icon: 'arrow-up' as const },
  down: { color: '#dc2626', icon: 'arrow-down' as const },
  flat: { color: '#8A8F9B', icon: 'remove' as const },
};

function StatCard({ label, value, delta, sub, icon }: { label: string; value: string; delta?: PeriodDelta; sub?: string; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  const d = delta ? DELTA_STYLE[delta.direction] : null;
  return (
    <View style={{ flex: 1, minWidth: 160, backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEF0F5' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#8A8F9B', letterSpacing: 0.5 }}>{label}</Text>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: Brand.vendorAccentLight, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={14} color={Brand.vendorAccent} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: Brand.textPrimary }}>{value}</Text>
        {delta && d && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Ionicons name={d.icon} size={10} color={d.color} />
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: d.color }}>{delta.pct}%</Text>
          </View>
        )}
      </View>
      {sub && <Text style={{ fontSize: 11.5, color: '#8A8F9B' }}>{sub}</Text>}
    </View>
  );
}

export default function VendorOverviewScreen() {
  const { t, locale } = useI18n();
  const orders = useVendorOrders();
  const menu = useVendorMenu();
  const vendor = useVendorProfile();
  const [range, setRange] = useState<DateRangeFilter>('today');
  const [expandedSellers, setExpandedSellers] = useState<Set<string>>(new Set());

  const rangeOptions: { key: DateRangeFilter; label: string }[] = [
    { key: 'today', label: t('common.today') },
    { key: 'yesterday', label: t('common.yesterday') },
    { key: 'week', label: t('common.thisWeek') },
    { key: 'month', label: t('common.thisMonth') },
  ];
  const rangedOrders = orders.filter(o => isBangkokDateInRange(o.created_at, range));

  const totalOrders = rangedOrders.length;
  // Money only actually lands in the vendor's wallet once both sides confirm
  // handoff — accepted/ready orders are still held in student-side escrow.
  const revenueToday = rangedOrders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + o.total_amount, 0);
  const activeQueue = orders.filter(o => o.status === 'pending' || o.status === 'accepted').length;
  const queueCapacity = 20;

  // Real window-over-window change (null when there's no prior-period data).
  const ordersDelta = useMemo(() => periodDelta(orders, range, 'orders'), [orders, range]);
  const revenueDelta = useMemo(() => periodDelta(orders, range, 'revenue'), [orders, range]);
  const deltaSub = range === 'today' ? t('vendor.overview.vsYesterday') : t('vendor.overview.vsPrevPeriod');
  const rangeSub = range === 'today' ? t('vendor.overview.vsYesterday') : rangeOptions.find(o => o.key === range)!.label;

  // Measured placed → handed-off time; falls back to the static stall estimate.
  const fulfilment = useMemo(() => avgFulfilmentMinutes(orders, range), [orders, range]);
  const avgPrepValue = fulfilment ?? vendor?.estimated_wait_min ?? 0;
  const avgPrepLabel = fulfilment != null ? t('vendor.overview.avgFulfilment') : t('vendor.overview.avgPrepTime');

  // Per-item sales for the selected range, best seller first.
  const sales = useMemo(() => itemSales(orders, range), [orders, range]);
  const topSellers = sales.slice(0, 5);
  const maxUnits = Math.max(1, ...topSellers.map(s => s.units));
  const soldIds = new Set(sales.map(s => s.menuItemId));
  const slowMovers = menu.filter(m => m.is_available && !soldIds.has(m.id)).slice(0, 3);

  // Sales Velocity bars follow the header range: hourly for today/yesterday
  // (clamped to the stall's open window), one bar per day for week/month.
  const openHour = parseHour(vendor?.open_time ?? null, 9);
  const closeHour = parseHour(vendor?.close_time ?? null, 20);
  const hourly = range === 'today' || range === 'yesterday';
  const bars = useMemo(
    () => salesVelocity(orders, range, openHour, closeHour),
    [orders, range, openHour, closeHour],
  );
  const maxBar = Math.max(0, ...bars.map(b => b.value));
  const hasSales = maxBar > 0;
  // The heatmap needs a wide window to be meaningful, so it ignores the
  // header range and always looks at the last 4 weeks.
  const grid = useMemo(() => busyGrid(orders), [orders]);

  const comingSoon = () => comingSoonAlert(t);

  return (
    <View style={{ gap: 20 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: Brand.textPrimary }}>{t('vendor.overview.title')}</Text>
          <Text style={{ fontSize: 13, color: '#8A8F9B', marginTop: 2 }}>{t('vendor.overview.subtitle')}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PillDropdown
            icon="calendar-outline"
            label={rangeOptions.find(o => o.key === range)!.label}
            options={rangeOptions}
            selected={range}
            onSelect={setRange}
          />
          <Tap onPress={comingSoon} style={{ backgroundColor: Brand.orange, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{t('vendor.overview.downloadReport')}</Text>
          </Tap>
        </View>
      </View>

      {/* Stat cards — delta badges are decorative (no historical order data to diff against yet) */}
      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        <StatCard label={t('vendor.overview.totalOrders')} value={String(totalOrders)} delta={ordersDelta} sub={ordersDelta ? deltaSub : rangeSub} icon="bag-handle-outline" />
        <StatCard label={t('vendor.overview.revenueToday')} value={`฿${revenueToday.toLocaleString()}`} delta={revenueDelta} sub={revenueDelta ? deltaSub : rangeSub} icon="cash-outline" />
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
        <StatCard label={avgPrepLabel} value={`${avgPrepValue}m`} icon="time-outline" />
      </View>

      {/* Sales velocity + busy-times heatmap */}
      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        <View style={{ flex: 2, minWidth: 320, backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#EEF0F5' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>{t('vendor.overview.salesVelocity')}</Text>
            <View style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#8A8F9B' }}>
                {t(hourly ? 'vendor.overview.salesPerHour' : 'vendor.overview.salesPerDay')}
              </Text>
            </View>
          </View>
          {hasSales ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: bars.length > 12 ? 3 : 8, height: 140 }}>
              {bars.map((bar, i) => {
                const showLabel = bars.length <= 12 || i % 5 === 0 || i === bars.length - 1;
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                    <View style={{
                      width: '100%',
                      height: `${(bar.value / maxBar) * 100}%`,
                      minHeight: bar.value > 0 ? 4 : 0,
                      borderRadius: 6,
                      backgroundColor: bar.value === maxBar ? Brand.vendorAccent : bar.isNow ? Brand.orange : '#EEF0F5',
                    }} />
                    <Text style={{ fontSize: 9, color: '#8A8F9B' }}>{showLabel ? bar.label : ''}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={{ height: 140, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, color: '#8A8F9B' }}>{t('vendor.overview.noSalesRange')}</Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1, minWidth: 220, backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#EEF0F5' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>{t('vendor.overview.trafficHeatmap')}</Text>
            <Text style={{ fontSize: 10, color: '#8A8F9B' }}>{t('vendor.overview.busyTimesCaption')}</Text>
          </View>
          <View style={{ gap: 6 }}>
            {grid.rows.map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ width: 26, fontSize: 9, color: '#8A8F9B' }}>{t(`vendor.overview.dow.${DOW[i]}` as TranslationKey)}</Text>
                {row.map((count, j) => (
                  <View key={j} style={{
                    flex: 1, aspectRatio: 2.2, borderRadius: 6,
                    backgroundColor: `rgba(108,99,255,${grid.max ? 0.08 + 0.92 * (count / grid.max) : 0.08})`,
                  }} />
                ))}
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginLeft: 32 }}>
            <Text style={{ fontSize: 10, color: '#8A8F9B' }}>{t('vendor.overview.morning')}</Text>
            <Text style={{ fontSize: 10, color: '#8A8F9B' }}>{t('vendor.overview.lunch')}</Text>
            <Text style={{ fontSize: 10, color: '#8A8F9B' }}>{t('vendor.overview.evening')}</Text>
          </View>
        </View>
      </View>

      {/* Top sellers — follows the header range filter */}
      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#EEF0F5' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>{t('vendor.overview.topSellers')}</Text>
          <Text style={{ fontSize: 10, color: '#8A8F9B' }}>{t('vendor.overview.topSellersCaption')}</Text>
        </View>

        {topSellers.length === 0 ? (
          <Text style={{ fontSize: 12, color: '#8A8F9B', paddingVertical: 12 }}>{t('vendor.overview.noSalesRange')}</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {topSellers.map((s, i) => (
              <View key={s.menuItemId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ width: 18, fontSize: 13, fontWeight: '800', color: i === 0 ? Brand.vendorAccent : '#B0B4BF' }}>{i + 1}</Text>
                <View style={{ flex: 1, gap: 5 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Tap
                      style={{ flex: 1 }}
                      onPress={() =>
                        setExpandedSellers(prev => {
                          const next = new Set(prev);
                          if (next.has(s.menuItemId)) next.delete(s.menuItemId);
                          else next.add(s.menuItemId);
                          return next;
                        })
                      }
                    >
                      <Text
                        style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary }}
                        numberOfLines={expandedSellers.has(s.menuItemId) ? undefined : 1}
                      >
                        {localizedText(s.name, s.nameTh, locale)}
                      </Text>
                    </Tap>
                    <Text style={{ fontSize: 12, color: '#8A8F9B' }}>
                      {t('vendor.overview.unitsSold', { n: s.units })} · ฿{s.revenue.toLocaleString()}
                    </Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: '#F0F1F5', overflow: 'hidden' }}>
                    <View style={{ width: `${(s.units / maxUnits) * 100}%`, height: '100%', backgroundColor: Brand.vendorAccent, borderRadius: 3 }} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {slowMovers.length > 0 && (
          <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: '#EEF0F5', paddingTop: 14, gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#8A8F9B', letterSpacing: 0.5 }}>{t('vendor.overview.slowMovers')}</Text>
            <Text style={{ fontSize: 10.5, color: '#B0B4BF' }}>{t('vendor.overview.slowMoverHint')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {slowMovers.map(m => (
                <View key={m.id} style={{ backgroundColor: '#F6F7F9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: '#6B7280' }} numberOfLines={1}>{localizedText(m.name, m.name_th, locale)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
