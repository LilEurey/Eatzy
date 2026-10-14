import { useEffect, useState } from 'react';
import { SkeletonList } from '@/components/Skeleton';
import { View, Text, ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { enterUp, popIn } from '@/lib/motion';
import { Tap } from '@/components/Tap';
import { KitchenBackdrop, ClassroomBackdrop, CanteenBackdrop } from '@/components/KitchenBackdrop';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { showAlert, showConfirm } from '@/lib/alert';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';
import { formatBangkokClock } from '@/lib/time';
import { mapOrderItems } from '@/lib/order-view';
import { addToCart, clearCart } from '@/lib/cart-store';
import { confirmHandoff, transitionOrderWithAlert, type OrderStatus } from '@/lib/order-lifecycle';

// Gentle breathing scale on the current step (Reanimated 4 CSS animation).
const PULSE = {
  animationName: { from: { transform: [{ scale: 1 }] }, to: { transform: [{ scale: 1.1 }] } },
  animationDuration: '900ms',
  animationIterationCount: 'infinite',
  animationDirection: 'alternate',
  animationTimingFunction: 'ease-in-out',
} as const;

// 'rejected' / 'cancelled' are reachable while this screen is mounted — the
// realtime UPDATE below pushes whatever the vendor (or accept_order_and_charge's
// insufficient-balance auto-reject) wrote. They're terminal and off the happy
// path, so they replace the stepper instead of indexing into it: ORDER.indexOf
// returns -1 for them, which rendered every step as not-yet-reached and left
// the student on a frozen tracker with no explanation.
type Status = OrderStatus;

type TrackOrder = {
  id: string;
  vendor_id: string;
  queue_number: number | null;
  pickup_start: string | null;
  pickup_end: string | null;
  total_amount: number;
  vendor_name: string;
  student_picked_up_at: string | null;
  rated: boolean;
  // A payments row exists only once accept_order_and_charge has run, so its
  // absence is the authoritative "the wallet was never touched" signal. The
  // terminal panel states that to the student either way, and asserting it
  // from data beats asserting it from "no code path does that yet" — the
  // status guard (20260910000000) deliberately allows accepted -> cancelled
  // so escrow can be unwound later.
  was_charged: boolean;
  items: { name: string; name_th: string | null; quantity: number; unit_price: number; addons: { name: string; name_th: string | null; price: number }[] }[];
};

const STEPS: { key: Status; labelKey: TranslationKey; icon: number; hintKey: TranslationKey }[] = [
  { key: 'pending',   labelKey: 'track.stepPlacedLabel',   icon: require('../../../assets/images/track/step-placed.jpg'), hintKey: 'track.stepPlacedHint' },
  { key: 'accepted',  labelKey: 'orders.status.preparing', icon: require('../../../assets/images/track/step-preparing.jpg'), hintKey: 'track.stepPreparingHint' },
  { key: 'ready',     labelKey: 'orders.status.ready',     icon: require('../../../assets/images/track/step-ready.jpg'), hintKey: 'track.stepReadyHint' },
  { key: 'completed', labelKey: 'track.stepPickedUpLabel', icon: require('../../../assets/images/track/step-picked-up.jpg'), hintKey: 'track.stepPickedUpHint' },
];

// Per-stage animation; stages without one fall back to the pulsing emoji.
const STAGE_ANIM: Partial<Record<Status, number>> = {
  pending: require('../../../assets/images/track/placed.gif'),
  accepted: require('../../../assets/images/track/preparing.gif'),
  ready: require('../../../assets/images/track/ready.gif'),
  // Plays once (no loop) and holds on the check — opaque white, since keying
  // white out would punch through the checkmark.
  completed: require('../../../assets/images/track/picked-up.gif'),
};

// Scene behind each stage's GIF; stages without one sit on the plain card.
const STAGE_BACKDROP: Partial<Record<Status, () => React.JSX.Element>> = {
  pending: ClassroomBackdrop,
  accepted: KitchenBackdrop,
  ready: CanteenBackdrop,
};

const ORDER: Status[] = ['pending', 'accepted', 'ready', 'completed'];

const TERMINAL: Partial<Record<Status, { icon: string; titleKey: TranslationKey; bodyKey: TranslationKey }>> = {
  rejected:  { icon: '❌', titleKey: 'orders.status.rejected',  bodyKey: 'track.rejectedMsg' },
  cancelled: { icon: '✖️', titleKey: 'orders.status.cancelled', bodyKey: 'track.cancelledMsg' },
};

export default function TrackScreen() {
  const { t, locale } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<TrackOrder | null | undefined>(undefined);
  const [status, setStatus] = useState<Status>('pending');
  const [ordersAhead, setOrdersAhead] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from('orders')
        .select('id,vendor_id,queue_number,status,pickup_start,pickup_end,total_amount,student_picked_up_at,vendors(name),payments(status),ratings(id),order_items(quantity,unit_price,menu_items(name,name_th),order_item_addons(name,name_th,price))')
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // A refetch blip keeps the last good order on screen; only a failed
        // first load falls through to "not found".
        console.warn('load order failed:', error.message);
        setOrder(prev => (prev === undefined ? null : prev));
        return;
      }
      if (!data) { setOrder(null); return; }
      setOrder({
        id: data.id,
        vendor_id: data.vendor_id,
        queue_number: data.queue_number,
        pickup_start: data.pickup_start,
        pickup_end: data.pickup_end,
        total_amount: data.total_amount,
        vendor_name: data.vendors?.name ?? '',
        student_picked_up_at: data.student_picked_up_at,
        rated: data.ratings.length > 0,
        // payments.order_id is unique, so PostgREST embeds it to-ONE: an object
        // when the order was charged, null when it wasn't — not an array.
        was_charged: !!data.payments,
        items: mapOrderItems(data.order_items),
      });
      setStatus(data.status as Status);
    }
    // Subscribe before the first fetch so an update landing in between isn't
    // lost. Each update refetches the whole row: status alone isn't enough —
    // was_charged (payments) and the handoff timestamps change too, and the
    // terminal "no charge" vs "refunded" copy depends on them.
    const channel = supabase
      .channel(`track-order-${id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, () => {
        void load();
      })
      .subscribe();
    void load();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [id]);

  // Queue position ("N orders ahead of you") — the RPC itself returns null
  // once this order leaves pending/accepted, so no separate hide logic is
  // needed here beyond rendering when non-null.
  const vendorId = order?.vendor_id;
  useEffect(() => {
    if (!vendorId) return;
    async function fetchOrdersAhead() {
      const { data, error } = await supabase.rpc('get_orders_ahead', { p_order_id: id });
      if (error) { console.warn('get_orders_ahead failed:', error.message); return; }
      setOrdersAhead(data ?? null);
    }
    void fetchOrdersAhead();

    const channel = supabase
      .channel(`track-queue-${vendorId}-${id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `vendor_id=eq.${vendorId}` }, () => {
        void fetchOrdersAhead();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [vendorId, id]);

  // Refill the cart with the same dishes, add-ons and notes at today's prices.
  // Anything no longer available is left out; place_order() re-validates the rest.
  async function orderAgain() {
    const { data, error } = await supabase
      .from('order_items')
      .select('quantity,special_instructions,menu_items(id,vendor_id,name,name_th,price,allergens,is_available),order_item_addons(addon_id,menu_item_addons(id,name,name_th,price,allergens,is_available))')
      .eq('order_id', id);
    if (error) { showAlert(t('common.errorTitle'), error.message); return; }
    let skipped = false;
    const lines = (data ?? []).filter(oi => {
      const ok = !!oi.menu_items?.is_available;
      if (!ok) skipped = true;
      return ok;
    });
    if (lines.length === 0) { showAlert(t('track.orderAgain'), t('track.orderAgainNone')); return; }
    clearCart();
    for (const oi of lines) {
      const addons = oi.order_item_addons.flatMap(a => {
        const opt = a.menu_item_addons;
        if (!opt?.is_available) { skipped = true; return []; }
        return [{ id: opt.id, name: opt.name, name_th: opt.name_th, price: opt.price, allergens: opt.allergens ?? [] }];
      });
      addToCart(oi.menu_items!, oi.quantity, addons, oi.special_instructions ?? '');
    }
    router.push('/cart');
    if (skipped) showAlert(t('track.orderAgain'), t('track.orderAgainSkipped'));
  }

  async function markPickedUp() {
    if (!order) return;
    const error = await confirmHandoff('student', order.id);
    if (error) { showAlert(t('common.errorTitle'), error); return; }
    router.replace(`/rate/${order.id}`);
  }

  async function cancelOrder() {
    if (!order) return;
    showConfirm(
      t('track.cancelConfirmTitle'),
      t('track.cancelConfirmMsg'),
      async () => {
        // Guarded on 'pending': if the vendor accepted between this screen's
        // last render and this tap, the transition loses the race instead of
        // silently cancelling an order the vendor already committed to.
        const ok = await transitionOrderWithAlert(order.id, 'pending', 'cancelled', {
          errorTitle: t('common.errorTitle'),
          lostRaceTitle: t('track.cancelFailedTitle'),
          lostRaceMessage: t('track.cancelFailedMsg'),
        });
        if (!ok) return;
        router.replace('/(tabs)/orders');
      },
      { confirmLabel: t('track.cancelConfirmAction'), cancelLabel: t('common.cancel'), destructive: true },
    );
  }

  if (order === undefined) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
        <SkeletonList title />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 }}>
          <Tap onPress={() => router.back()}>
            <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
          </Tap>
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
  const terminal = TERMINAL[status];
  const Backdrop = STAGE_BACKDROP[status];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12 }}>
        <Tap onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
        </Tap>
        <Text style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.2, color: Brand.textPrimary }}>{t('track.title')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
        {/* Terminal state — the order is dead, so there is no progress to step
            through. Shown in place of the tracker for rejected/cancelled. */}
        {terminal ? (
          <View style={{
            backgroundColor: Brand.card, borderRadius: 20, padding: 24, marginBottom: 24, marginTop: 8,
            alignItems: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
          }}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>{terminal.icon}</Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: Brand.textPrimary, marginBottom: 6 }}>
              {t(terminal.titleKey)}
            </Text>
            <Text style={{ fontSize: 13, color: Brand.textSecondary, textAlign: 'center', lineHeight: 19 }}>
              {t(terminal.bodyKey, { vendor })}
              {' '}
              {t(order.was_charged ? 'track.terminalRefund' : 'track.terminalNoCharge')}
            </Text>
          </View>
        ) : (
        <View style={{
          backgroundColor: Brand.card, borderRadius: 24, padding: 20, marginBottom: 24, marginTop: 8,
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
        }}>
          {/* 1. Stage animation — add more stages in STAGE_ANIM */}
          <View style={{ minHeight: 140, alignItems: 'center', justifyContent: 'center' }}>
            {STAGE_ANIM[status] ? (
              <View style={{ alignSelf: 'stretch', height: 200, margin: -20, marginBottom: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: Backdrop ? Brand.orangeLight : Brand.card }}>
                {Backdrop && <View style={{ position: 'absolute', inset: 0 }}><Backdrop /></View>}
                {/* placed.gif's arm is cut at the frame edge — sit it flush on the bottom */}
                {/* ready.gif is a full-width canvas (672x384) so the walker crosses edge to edge */}
                <Image source={STAGE_ANIM[status]} style={status === 'ready' ? { position: 'absolute', bottom: 6, left: 0, right: 0, aspectRatio: 672 / 384 } : { position: 'absolute', bottom: status === 'pending' ? 0 : 8, alignSelf: 'center', width: 260, height: 195 }} contentFit="contain" />
              </View>
            ) : (
              <Animated.View key={status} entering={popIn} style={PULSE}>
                <Image source={STEPS[currentIdx].icon} style={{ width: 96, height: 96, borderRadius: 48 }} />
              </Animated.View>
            )}
          </View>

          {/* 2. Status + horizontal stepper */}
          <Text style={{ fontSize: 22, fontWeight: '800', color: Brand.textPrimary }}>
            {t(STEPS[currentIdx].labelKey)}
          </Text>
          <Animated.Text key={`hint-${status}`} entering={enterUp()} style={{ fontSize: 13, color: Brand.textSecondary, marginTop: 2 }}>
            {t(STEPS[currentIdx].hintKey)}
          </Animated.Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
            {STEPS.map((step, i) => {
              const reached = i <= currentIdx;
              return (
                <View key={step.key} style={{ flexDirection: 'row', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
                  <Animated.View style={[{
                    width: 26, height: 26, borderRadius: 13,
                    backgroundColor: reached ? Brand.orange : Brand.orangeLight,
                    alignItems: 'center', justifyContent: 'center',
                    transitionProperty: 'backgroundColor', transitionDuration: 400,
                  }, i === currentIdx && PULSE]}>
                    <Image source={step.icon} style={{ width: 22, height: 22, borderRadius: 11, opacity: reached ? 1 : 0.4 }} />
                  </Animated.View>
                  {i < STEPS.length - 1 && (
                    <Animated.View style={{
                      flex: 1, height: 4, borderRadius: 2, marginHorizontal: 4,
                      backgroundColor: i < currentIdx ? Brand.orange : Brand.border,
                      transitionProperty: 'backgroundColor', transitionDuration: 400,
                    }} />
                  )}
                </View>
              );
            })}
          </View>

          {/* 3. Queue number */}
          <View style={{ height: 1, backgroundColor: Brand.border, marginVertical: 16 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: Brand.textPrimary }}>{vendor}</Text>
              <Text style={{ fontSize: 12, color: Brand.textSecondary, marginTop: 2 }}>
                {t('common.pickupRange', { start: formatBangkokClock(order.pickup_start), end: formatBangkokClock(order.pickup_end) })}
              </Text>
              {ordersAhead !== null && (
                <Text style={{ fontSize: 12, fontWeight: '600', color: Brand.orange, marginTop: 4 }}>
                  {t('track.ordersAhead', { n: ordersAhead })}
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1, color: Brand.textSecondary }}>{t('track.queueNumber')}</Text>
              <Text style={{ fontSize: 32, fontWeight: '800', color: Brand.orange, fontVariant: ['tabular-nums'] }}>#{order.queue_number}</Text>
            </View>
          </View>
        </View>
        )}

        {/* Items */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginBottom: 10 }}>
          {t('track.order')}
        </Text>
        <View style={{
          backgroundColor: Brand.card, borderRadius: 20, padding: 16, gap: 10,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
        }}>
          {order.items.map((it, i) => {
            const addonSum = it.addons.reduce((s, a) => s + a.price, 0);
            return (
              <View key={i} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ flex: 1, fontSize: 14, color: Brand.textPrimary }}>
                    {it.quantity > 1 ? `${it.quantity}× ` : ''}{localizedText(it.name, it.name_th, locale)}
                  </Text>
                  <Text style={{ fontSize: 14, color: Brand.textSecondary, fontVariant: ['tabular-nums'] }}>฿{(it.unit_price + addonSum) * it.quantity}</Text>
                </View>
                {it.addons.map((a, ai) => (
                  <Text key={ai} style={{ fontSize: 12, color: Brand.textSecondary, marginLeft: 12 }}>
                    + {localizedText(a.name, a.name_th, locale)}
                  </Text>
                ))}
              </View>
            );
          })}
          <View style={{ height: 1, backgroundColor: Brand.border }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>{t('common.total')}</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.orange, fontVariant: ['tabular-nums'] }}>฿{order.total_amount}</Text>
          </View>
        </View>
      </ScrollView>

      {status === 'pending' && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: Brand.card, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
          borderTopWidth: 1, borderTopColor: Brand.border,
        }}>
          <Tap
            activeOpacity={0.85}
            onPress={cancelOrder}
            style={{ backgroundColor: '#FEE2E2', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: '#dc2626', fontSize: 16, fontWeight: '700' }}>{t('track.cancelOrder')}</Text>
          </Tap>
        </View>
      )}

      {/* Sticky action when ready */}
      {isReady && !(order.student_picked_up_at && order.rated) && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: Brand.card, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
          borderTopWidth: 1, borderTopColor: Brand.border,
        }}>
          {order.student_picked_up_at ? (
            <Tap
              activeOpacity={0.85}
              onPress={() => router.replace(`/rate/${order.id}`)}
              style={{ backgroundColor: Brand.orange, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{t('track.rateYourOrder')}</Text>
            </Tap>
          ) : (
            <Tap
              activeOpacity={0.85}
              onPress={markPickedUp}
              style={{ backgroundColor: Brand.orange, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{t('track.pickedItUp')}</Text>
            </Tap>
          )}
        </View>
      )}

      {status === 'completed' && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: Brand.card, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
          borderTopWidth: 1, borderTopColor: Brand.border, gap: 10,
        }}>
          <Tap
            activeOpacity={0.85}
            onPress={orderAgain}
            style={order.rated
              ? { backgroundColor: Brand.orange, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }
              : { backgroundColor: Brand.orangeLight, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: order.rated ? '#fff' : Brand.orange, fontSize: 16, fontWeight: '700' }}>{t('track.orderAgain')}</Text>
          </Tap>
          {!order.rated && <Tap
            activeOpacity={0.85}
            onPress={() => router.replace(`/rate/${order.id}`)}
            style={{ backgroundColor: Brand.orange, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{t('track.rateYourOrder')}</Text>
          </Tap>}
        </View>
      )}
    </SafeAreaView>
  );
}
