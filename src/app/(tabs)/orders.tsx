import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { useI18n, type TranslationKey } from '@/lib/i18n';

type OrderStatus = 'pending' | 'accepted' | 'rejected' | 'ready' | 'completed' | 'cancelled';
type FilterTab = 'All' | 'Active' | 'Completed' | 'Cancelled';

type StudentOrder = {
  id: string;
  vendor_id: string;
  queue_number: number | null;
  status: OrderStatus;
  total_amount: number;
  pickup_start: string | null;
  pickup_end: string | null;
  created_at: string;
  vendor_name: string;
  items: { name: string; quantity: number }[];
};

function formatClock(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_CONFIG: Record<OrderStatus, { labelKey: TranslationKey; color: string; bg: string }> = {
  pending:   { labelKey: 'orders.status.pending',   color: '#d97706', bg: '#fef3c7' },
  accepted:  { labelKey: 'orders.status.preparing', color: '#2563eb', bg: '#dbeafe' },
  rejected:  { labelKey: 'orders.status.rejected',  color: '#dc2626', bg: '#fee2e2' },
  ready:     { labelKey: 'orders.status.ready',     color: '#16a34a', bg: '#dcfce7' },
  completed: { labelKey: 'orders.status.completed', color: '#6b7280', bg: '#f3f4f6' },
  cancelled: { labelKey: 'orders.status.cancelled', color: '#9ca3af', bg: '#f3f4f6' },
};

const FILTER_LABELS: Record<FilterTab, TranslationKey> = {
  All: 'orders.filter.all',
  Active: 'orders.filter.active',
  Completed: 'orders.filter.completed',
  Cancelled: 'orders.filter.cancelled',
};

const PROGRESS_STEPS: TranslationKey[] = ['track.stepPlacedLabel', 'orders.status.preparing', 'orders.status.ready'];

const ACTIVE: OrderStatus[] = ['pending', 'accepted', 'ready'];

function timeAgo(iso: string, t: ReturnType<typeof useI18n>['t']) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t('common.justNow');
  if (diff < 3600) return t('common.minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('common.hoursAgo', { n: Math.floor(diff / 3600) });
  return t('common.daysAgo', { n: Math.floor(diff / 86400) });
}

export default function OrdersScreen() {
  const { t } = useI18n();
  const [tab, setTab] = useState<FilterTab>('All');
  const [orders, setOrders] = useState<StudentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from('orders')
        .select('id,vendor_id,queue_number,status,total_amount,pickup_start,pickup_end,created_at,vendors(name),order_items(quantity,menu_items(name))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      setOrders(((data as any[] | null) ?? []).map(o => ({
        id: o.id,
        vendor_id: o.vendor_id,
        queue_number: o.queue_number,
        status: o.status,
        total_amount: o.total_amount,
        pickup_start: o.pickup_start,
        pickup_end: o.pickup_end,
        created_at: o.created_at,
        vendor_name: o.vendors?.name ?? '',
        items: (o.order_items ?? []).map((oi: any) => ({ name: oi.menu_items?.name ?? '', quantity: oi.quantity })),
      })));
      setLoading(false);
    }
    void load();
  }, []);

  const filtered = orders.filter(o => {
    if (tab === 'All') return true;
    if (tab === 'Active') return ACTIVE.includes(o.status);
    if (tab === 'Completed') return o.status === 'completed';
    if (tab === 'Cancelled') return o.status === 'cancelled';
    return true;
  });

  const tabs: FilterTab[] = ['All', 'Active', 'Completed', 'Cancelled'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: Brand.textPrimary, letterSpacing: -0.5 }}>
          {t('orders.title')}
        </Text>
      </View>

      {/* Filter tabs */}
      <View style={{ height: 52 }}>
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, alignItems: 'center', height: 52 }}
        >
        {tabs.map(filterTab => {
          const active = filterTab === tab;
          return (
            <TouchableOpacity
              key={filterTab}
              onPress={() => setTab(filterTab)}
              style={{
                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99,
                backgroundColor: active ? Brand.orange : Brand.card,
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                shadowOpacity: active ? 0 : 0.04, shadowRadius: 4, elevation: active ? 0 : 1,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : Brand.textSecondary }}>
                {t(FILTER_LABELS[filterTab])}
              </Text>
            </TouchableOpacity>
          );
        })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Brand.orange} size="large" />
        </View>
      ) : (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
        {/* Active orders section */}
        {tab === 'All' && filtered.some(o => ACTIVE.includes(o.status)) && (
          <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginBottom: 10 }}>
            {t('orders.active')}
          </Text>
        )}

        <View style={{ gap: 12 }}>
          {filtered.map(order => {
            const cfg = STATUS_CONFIG[order.status];
            const vendor = order.vendor_name;
            const isActive = ACTIVE.includes(order.status);
            const itemSummary = order.items.map(i => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ');

            return (
              <View
                key={order.id}
                style={{
                  backgroundColor: Brand.card, borderRadius: 20, padding: 16,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
                  borderLeftWidth: isActive ? 3 : 0,
                  borderLeftColor: isActive ? Brand.orange : 'transparent',
                }}
              >
                {/* Top row */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary, marginBottom: 2 }}>
                      {vendor}
                    </Text>
                    <Text style={{ fontSize: 12, color: Brand.textSecondary }}>
                      {t('orders.queueLine', { n: order.queue_number ?? '—', time: timeAgo(order.created_at, t) })}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: cfg.bg, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: cfg.color }}>{t(cfg.labelKey)}</Text>
                  </View>
                </View>

                {/* Items */}
                <Text style={{ fontSize: 13, color: Brand.textSecondary, marginBottom: 12 }} numberOfLines={1}>
                  {itemSummary}
                </Text>

                {/* Progress bar for active */}
                {isActive && (
                  <View style={{ marginBottom: 12 }}>
                    <View style={{ height: 4, backgroundColor: Brand.border, borderRadius: 2 }}>
                      <View style={{
                        height: 4, borderRadius: 2, backgroundColor: Brand.orange,
                        width: order.status === 'pending' ? '15%' : order.status === 'accepted' ? '60%' : '100%',
                      }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      {PROGRESS_STEPS.map((s, i) => (
                        <Text key={s} style={{
                          fontSize: 10,
                          color: (
                            (order.status === 'pending' && i === 0) ||
                            (order.status === 'accepted' && i <= 1) ||
                            (order.status === 'ready')
                          ) ? Brand.orange : Brand.textSecondary,
                        }}>
                          {t(s)}
                        </Text>
                      ))}
                    </View>
                  </View>
                )}

                {/* Pickup time + total */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 12 }}>🕐</Text>
                    <Text style={{ fontSize: 12, color: Brand.textSecondary }}>
                      {t('common.pickupRange', { start: formatClock(order.pickup_start), end: formatClock(order.pickup_end) })}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>
                    ฿{order.total_amount}
                  </Text>
                </View>

                {/* Action button */}
                {isActive && (
                  <TouchableOpacity
                    onPress={() => router.push(`/track/${order.id}`)}
                    style={{
                      marginTop: 12, backgroundColor: order.status === 'ready' ? Brand.orange : Brand.orangeLight,
                      borderRadius: 12, paddingVertical: 10, alignItems: 'center',
                    }}
                  >
                    <Text style={{
                      fontSize: 13, fontWeight: '700',
                      color: order.status === 'ready' ? '#fff' : Brand.orange,
                    }}>
                      {order.status === 'ready' ? t('orders.readyForPickup') : t('orders.trackOrder')}
                    </Text>
                  </TouchableOpacity>
                )}

                {order.status === 'completed' && (
                  <TouchableOpacity
                    onPress={() => router.push(`/rate/${order.id}`)}
                    style={{
                      marginTop: 12, borderWidth: 1.5, borderColor: Brand.border,
                      borderRadius: 12, paddingVertical: 10, alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textSecondary }}>
                      {t('orders.rateOrder')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {filtered.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🧾</Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: Brand.textPrimary, marginBottom: 4 }}>
                {t('orders.noOrdersTitle')}
              </Text>
              <Text style={{ fontSize: 14, color: Brand.textSecondary }}>
                {t('orders.noOrdersSubtitle')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
      )}
    </SafeAreaView>
  );
}
