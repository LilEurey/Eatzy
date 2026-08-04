import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { formatBangkokClock } from '@/lib/time';

type Status = 'pending' | 'accepted' | 'ready' | 'completed';

type TrackOrder = {
  id: string;
  queue_number: number | null;
  pickup_start: string | null;
  pickup_end: string | null;
  total_amount: number;
  vendor_name: string;
  items: { name: string; quantity: number; unit_price: number }[];
};

const STEPS: { key: Status; labelKey: TranslationKey; icon: string; hintKey: TranslationKey }[] = [
  { key: 'pending',   labelKey: 'track.stepPlacedLabel',   icon: '📝', hintKey: 'track.stepPlacedHint' },
  { key: 'accepted',  labelKey: 'orders.status.preparing', icon: '👨‍🍳', hintKey: 'track.stepPreparingHint' },
  { key: 'ready',     labelKey: 'orders.status.ready',     icon: '🎉', hintKey: 'track.stepReadyHint' },
  { key: 'completed', labelKey: 'track.stepPickedUpLabel', icon: '✅', hintKey: 'track.stepPickedUpHint' },
];

const ORDER: Status[] = ['pending', 'accepted', 'ready', 'completed'];

export default function TrackScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<TrackOrder | null | undefined>(undefined);
  const [status, setStatus] = useState<Status>('pending');

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('orders')
        .select('id,queue_number,status,pickup_start,pickup_end,total_amount,vendors(name),order_items(quantity,unit_price,menu_items(name))')
        .eq('id', id)
        .maybeSingle();
      if (!data) { setOrder(null); return; }
      setOrder({
        id: data.id,
        queue_number: data.queue_number,
        pickup_start: data.pickup_start,
        pickup_end: data.pickup_end,
        total_amount: data.total_amount,
        vendor_name: (data as any).vendors?.name ?? '',
        items: ((data as any).order_items ?? []).map((oi: any) => ({ name: oi.menu_items?.name ?? '', quantity: oi.quantity, unit_price: oi.unit_price })),
      });
      setStatus(data.status as Status);
    }
    void load();

    const channel = supabase
      .channel(`track-order-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, (payload) => {
        setStatus(payload.new.status as Status);
      })
      .subscribe();
    return () => { void channel.unsubscribe(); };
  }, [id]);

  async function markPickedUp() {
    if (!order) return;
    const { error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
    if (error) { showAlert(t('common.orderNotFound'), error.message); return; }
    const { error: releaseError } = await supabase.rpc('release_escrow_to_vendor', { p_order_id: order.id });
    if (releaseError && releaseError.message !== 'order_not_found_or_already_settled') {
      showAlert(t('common.orderNotFound'), releaseError.message);
    }
    setStatus('completed');
  }

  if (order === undefined) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Brand.orange} size="large" />
      </SafeAreaView>
    );
  }

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
          <Text style={{ color: Brand.textSecondary, marginTop: 12 }}>{t('common.orderNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const vendor = order.vendor_name;
  const currentIdx = ORDER.indexOf(status);
  const isReady = status === 'ready';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>{t('track.title')}</Text>
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
            {t('track.queueNumber')}
          </Text>
          <Text style={{ fontSize: 56, fontWeight: '800', color: isReady ? '#fff' : Brand.orange, marginVertical: 4 }}>
            #{order.queue_number}
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: isReady ? '#fff' : Brand.textPrimary }}>
            {vendor}
          </Text>
          <Text style={{ fontSize: 13, color: isReady ? 'rgba(255,255,255,0.85)' : Brand.textSecondary, marginTop: 2 }}>
            {t('common.pickupRange', { start: formatBangkokClock(order.pickup_start), end: formatBangkokClock(order.pickup_end) })}
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
                    {t(step.labelKey)}
                  </Text>
                  {active && (
                    <Text style={{ fontSize: 13, color: Brand.orange, marginTop: 2 }}>{t(step.hintKey)}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Items */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginBottom: 10 }}>
          {t('track.order')}
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
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>{t('common.total')}</Text>
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
            onPress={markPickedUp}
            style={{ backgroundColor: Brand.orange, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{t('track.pickedItUp')}</Text>
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
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{t('track.rateYourOrder')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
