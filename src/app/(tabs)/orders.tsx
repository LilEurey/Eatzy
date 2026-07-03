import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Brand } from '@/constants/theme';
import { MOCK_ORDERS, getVendorName } from '@/lib/mock-data';

type OrderStatus = 'pending' | 'accepted' | 'rejected' | 'ready' | 'completed' | 'cancelled';
type FilterTab = 'All' | 'Active' | 'Completed' | 'Cancelled';

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending',   color: '#d97706', bg: '#fef3c7' },
  accepted:  { label: 'Preparing', color: '#2563eb', bg: '#dbeafe' },
  rejected:  { label: 'Rejected',  color: '#dc2626', bg: '#fee2e2' },
  ready:     { label: 'Ready!',    color: '#16a34a', bg: '#dcfce7' },
  completed: { label: 'Completed', color: '#6b7280', bg: '#f3f4f6' },
  cancelled: { label: 'Cancelled', color: '#9ca3af', bg: '#f3f4f6' },
};

const ACTIVE: OrderStatus[] = ['pending', 'accepted', 'ready'];

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function OrdersScreen() {
  const [tab, setTab] = useState<FilterTab>('All');

  const filtered = MOCK_ORDERS.filter(o => {
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
          Orders
        </Text>
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, height: 52 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, alignItems: 'center', height: 52 }}
      >
        {tabs.map(t => {
          const active = t === tab;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{
                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99,
                backgroundColor: active ? Brand.orange : Brand.card,
                shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                shadowOpacity: active ? 0 : 0.04, shadowRadius: 4, elevation: active ? 0 : 1,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : Brand.textSecondary }}>
                {t}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
        {/* Active orders section */}
        {tab === 'All' && filtered.some(o => ACTIVE.includes(o.status)) && (
          <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginBottom: 10 }}>
            ACTIVE
          </Text>
        )}

        <View style={{ gap: 12 }}>
          {filtered.map(order => {
            const cfg = STATUS_CONFIG[order.status];
            const vendor = getVendorName(order.vendor_id);
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
                      Queue #{order.queue_number} · {timeAgo(order.created_at)}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: cfg.bg, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
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
                      {['Order placed', 'Preparing', 'Ready!'].map((s, i) => (
                        <Text key={s} style={{
                          fontSize: 10,
                          color: (
                            (order.status === 'pending' && i === 0) ||
                            (order.status === 'accepted' && i <= 1) ||
                            (order.status === 'ready')
                          ) ? Brand.orange : Brand.textSecondary,
                        }}>
                          {s}
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
                      Pickup {order.pickup_start}–{order.pickup_end}
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
                      {order.status === 'ready' ? '🎉 Ready for Pickup!' : 'Track Order'}
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
                      Rate order
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
                No orders here
              </Text>
              <Text style={{ fontSize: 14, color: Brand.textSecondary }}>
                Your orders will appear here
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
