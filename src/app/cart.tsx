import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { useCart, setQty, clearCart, cartSubtotal } from '@/lib/cart-store';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { nextPickupSlots, timeSegmentForBangkok } from '@/lib/time';
import type { Database } from '@/types/database.types';

type Vendor = Database['public']['Tables']['vendors']['Row'];

export default function CartScreen() {
  const { t } = useI18n();
  const cart = useCart();
  const items = cart.items;
  // Computed once per visit (not on every render) so the offered windows
  // don't shift under the student while they're picking one — real "next
  // available" slots rolling from right now in Thailand time, not a fixed
  // noon-only list.
  const [slots] = useState(() => nextPickupSlots());
  const [selectedIndex, setSelectedIndex] = useState(1);
  const selectedSlot = slots[selectedIndex];
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [placing, setPlacing] = useState(false);

  const subtotal = cartSubtotal(cart);
  const total = subtotal + cart.packaging_fee;

  useEffect(() => {
    if (!cart.vendor_id) return; // cart empty — the empty-state branch below renders instead
    supabase.from('vendors').select('*').eq('id', cart.vendor_id).maybeSingle()
      .then(({ data }) => setVendor(data ?? null));
  }, [cart.vendor_id]);

  async function placeOrder() {
    if (!cart.vendor_id) return;
    setPlacing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const { data: queueNumber, error: queueError } = await supabase
        .rpc('next_queue_number', { p_vendor_id: cart.vendor_id });
      if (queueError) throw queueError;

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          vendor_id: cart.vendor_id,
          queue_number: queueNumber,
          status: 'pending',
          subtotal,
          packaging_fee: cart.packaging_fee,
          total_amount: total,
          payment_method: 'wallet',
          pickup_start: selectedSlot.start.toISOString(),
          pickup_end: selectedSlot.end.toISOString(),
          time_segment: timeSegmentForBangkok(selectedSlot.start),
        })
        .select('id')
        .single();
      if (orderError) throw orderError;

      const { error: itemsError } = await supabase.from('order_items').insert(
        items.map(i => ({ order_id: order.id, menu_item_id: i.menu_item_id, quantity: i.quantity, unit_price: i.unit_price })),
      );
      if (itemsError) throw itemsError;

      const { error: escrowError } = await supabase
        .rpc('place_order_escrow', { p_user_id: user.id, p_order_id: order.id, p_amount: total });
      if (escrowError) throw escrowError;

      clearCart();
      router.replace(`/track/${order.id}`);
    } catch (e: any) {
      const message = e.message === 'insufficient_wallet_balance'
        ? t('cart.insufficientBalanceMsg')
        : e.message;
      showAlert(t('cart.orderFailedTitle'), message);
    } finally {
      setPlacing(false);
    }
  }

  if (items.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>{t('cart.title')}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🛒</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: Brand.textPrimary, marginBottom: 6 }}>
            {t('cart.empty')}
          </Text>
          <Text style={{ fontSize: 14, color: Brand.textSecondary, marginBottom: 28 }}>
            {t('cart.addSomething')}
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)')}
            style={{
              backgroundColor: Brand.orange, borderRadius: 14,
              paddingHorizontal: 28, paddingVertical: 12,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('cart.browseMenu')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>{t('cart.title')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 160 }}>
        {/* Vendor chip */}
        {vendor && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: Brand.orangeLight, borderRadius: 14, padding: 12, marginBottom: 20,
          }}>
            <Text style={{ fontSize: 20 }}>🏪</Text>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textPrimary }}>{vendor.name}</Text>
              <Text style={{ fontSize: 11, color: Brand.textSecondary }}>{t('cart.stall', { n: vendor.stall_number ?? '' })}</Text>
            </View>
          </View>
        )}

        {/* Cart items */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginBottom: 10 }}>
          {t('cart.items')}
        </Text>
        <View style={{
          backgroundColor: Brand.card, borderRadius: 20, overflow: 'hidden', marginBottom: 24,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
        }}>
          {items.map((item, i) => (
            <View key={item.menu_item_id}>
              {i > 0 && <View style={{ height: 1, backgroundColor: Brand.border, marginHorizontal: 16 }} />}
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: Brand.textPrimary, marginBottom: 2 }}>
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: 14, color: Brand.textSecondary }}>{t('cart.unitPrice', { price: item.unit_price })}</Text>
                </View>

                {/* Qty controls */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 0,
                  backgroundColor: Brand.orangeLight, borderRadius: 12, overflow: 'hidden',
                }}>
                  <TouchableOpacity
                    onPress={() => setQty(item.menu_item_id, -1)}
                    style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 18, color: Brand.orange, fontWeight: '700', lineHeight: 20 }}>−</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.textPrimary, minWidth: 22, textAlign: 'center' }}>
                    {item.quantity}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setQty(item.menu_item_id, 1)}
                    style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 18, color: Brand.orange, fontWeight: '700', lineHeight: 20 }}>+</Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary, minWidth: 52, textAlign: 'right' }}>
                  ฿{item.unit_price * item.quantity}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Pickup time slot */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginBottom: 10 }}>
          {t('cart.pickupTime')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {slots.map((slot, i) => {
            const active = i === selectedIndex;
            return (
              <TouchableOpacity
                key={slot.start.toISOString()}
                onPress={() => setSelectedIndex(i)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
                  backgroundColor: active ? Brand.orange : Brand.card,
                  borderWidth: active ? 0 : 1.5, borderColor: Brand.border,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: active ? 0 : 0.03, shadowRadius: 3, elevation: active ? 0 : 1,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : Brand.textSecondary }}>
                  {slot.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Order summary */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.8, marginBottom: 10 }}>
          {t('cart.summary')}
        </Text>
        <View style={{
          backgroundColor: Brand.card, borderRadius: 20, padding: 16, gap: 10,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: Brand.textSecondary }}>{t('cart.subtotal')}</Text>
            <Text style={{ fontSize: 14, color: Brand.textPrimary, fontWeight: '600' }}>฿{subtotal}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: Brand.textSecondary }}>{t('cart.packagingFee')}</Text>
            <Text style={{ fontSize: 14, color: Brand.textPrimary, fontWeight: '600' }}>฿{cart.packaging_fee}</Text>
          </View>
          <View style={{ height: 1, backgroundColor: Brand.border }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: Brand.textPrimary }}>{t('common.total')}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: Brand.orange }}>฿{total}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: Brand.card, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
        borderTopWidth: 1, borderTopColor: Brand.border,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06, shadowRadius: 12, elevation: 10,
      }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={placeOrder}
          disabled={placing}
          style={{
            backgroundColor: Brand.orange, borderRadius: 16,
            paddingVertical: 16, alignItems: 'center', opacity: placing ? 0.7 : 1,
            shadowColor: Brand.orange, shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
          }}
        >
          {placing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                {t('cart.placeOrder', { total })}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>
                {t('cart.pickupAt', { slot: selectedSlot.label })}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
