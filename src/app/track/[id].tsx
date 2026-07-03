import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Brand } from '@/constants/theme';
import { getOrderById, getVendorName } from '@/lib/mock-data';

type Status = 'pending' | 'accepted' | 'ready' | 'completed';

const STEPS: { key: Status; label: string; icon: string; hint: string }[] = [
  { key: 'pending',   label: 'Order placed', icon: '📝', hint: 'Waiting for the vendor to accept' },
  { key: 'accepted',  label: 'Preparing',    icon: '👨‍🍳', hint: 'Your food is being cooked' },
  { key: 'ready',     label: 'Ready!',       icon: '🎉', hint: 'Come pick it up at the stall' },
  { key: 'completed', label: 'Picked up',    icon: '✅', hint: 'Enjoy your meal!' },
];

const ORDER: Status[] = ['pending', 'accepted', 'ready', 'completed'];

export default function TrackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = getOrderById(id);

  // ponytail: simulated live progression on a timer. Swap for a Supabase
  // Realtime subscription on orders.status when the DB is live.
  const [status, setStatus] = useState<Status>((order?.status as Status) ?? 'pending');

  useEffect(() => {
    const idx = ORDER.indexOf(status);
    if (idx < 0 || status === 'ready' || status === 'completed') return; // stop at ready; pickup is manual
    const t = setTimeout(() => setStatus(ORDER[idx + 1]), 5000);
    return () => clearTimeout(t);
  }, [status]);

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 40 }}>🧾</Text>
          <Text style={{ color: Brand.textSecondary, marginTop: 12 }}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const vendor = getVendorName(order.vendor_id);
  const currentIdx = ORDER.indexOf(status);
  const isReady = status === 'ready';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>Track Order</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
        {/* Queue hero */}
        <View style={{
          backgroundColor: isReady ? Brand.orange : Brand.card, borderRadius: 24, padding: 24,
          alignItems: 'center', marginBottom: 24, marginTop: 8,
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
        }}>
          <Text style={{ fontSize: 13, fontWeight: '600', letterSpacing: 1, color: isReady ? 'rgba(255,255,255,0.85)' : Brand.textSecondary }}>
            QUEUE NUMBER
          </Text>
          <Text style={{ fontSize: 56, fontWeight: '800', color: isReady ? '#fff' : Brand.orange, marginVertical: 4 }}>
            #{order.queue_number}
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: isReady ? '#fff' : Brand.textPrimary }}>
            {vendor}
          </Text>
          <Text style={{ fontSize: 13, color: isReady ? 'rgba(255,255,255,0.85)' : Brand.textSecondary, marginTop: 2 }}>
            Pickup {order.pickup_start}–{order.pickup_end}
          </Text>
        </View>

        {/* Stepper */}
        <View style={{
          backgroundColor: Brand.card, borderRadius: 20, padding: 20, marginBottom: 24,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
        }}>
          {STEPS.map((step, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            const reached = i <= currentIdx;
            return (
              <View key={step.key} style={{ flexDirection: 'row', gap: 14 }}>
                {/* Rail */}
                <View style={{ alignItems: 'center' }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 20,
                    backgroundColor: reached ? Brand.orange : Brand.orangeLight,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 18, opacity: reached ? 1 : 0.4 }}>{done ? '✓' : step.icon}</Text>
                  </View>
                  {i < STEPS.length - 1 && (
                    <View style={{ width: 2, flex: 1, minHeight: 28, backgroundColor: i < currentIdx ? Brand.orange : Brand.border }} />
                  )}
                </View>
                {/* Text */}
                <View style={{ flex: 1, paddingBottom: i < STEPS.length - 1 ? 20 : 0 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: reached ? Brand.textPrimary : Brand.textSecondary }}>
                    {step.label}
                  </Text>
                  {active && (
                    <Text style={{ fontSize: 13, color: Brand.orange, marginTop: 2 }}>{step.hint}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Items */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginBottom: 10 }}>
          ORDER
        </Text>
        <View style={{
          backgroundColor: Brand.card, borderRadius: 20, padding: 16, gap: 10,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
        }}>
          {order.items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: Brand.textPrimary }}>
                {it.quantity > 1 ? `${it.quantity}× ` : ''}{it.name}
              </Text>
              <Text style={{ fontSize: 14, color: Brand.textSecondary }}>฿{it.unit_price * it.quantity}</Text>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: Brand.border }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>Total</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.orange }}>฿{order.total_amount}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky action when ready */}
      {isReady && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: Brand.card, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
          borderTopWidth: 1, borderTopColor: Brand.border,
        }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setStatus('completed')}
            style={{ backgroundColor: Brand.orange, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>I've picked it up</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'completed' && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: Brand.card, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
          borderTopWidth: 1, borderTopColor: Brand.border,
        }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.replace(`/rate/${order.id}`)}
            style={{ backgroundColor: Brand.orange, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Rate your order</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
