import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { useCart, setQty, clearCart, cartSubtotal, lineUnitTotal } from '@/lib/cart-store';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';
import { nextPickupSlots, timeSegmentForBangkok } from '@/lib/time';
import type { Database } from '@/types/database.types';

type Vendor = Database['public']['Tables']['vendors']['Row'];

export default function CartScreen() {
  const { t, locale } = useI18n();
  const cart = useCart();
  const items = cart.items;
  // Computed once per visit (not on every render) so the offered windows
  // don't shift under the student while they're picking one — real "next
  // available" slots rolling from right now in Thailand time, not a fixed
  // noon-only list.
  const [slots] = useState(() => nextPickupSlots());
  const [selectedIndex, setSelectedIndex] = useState(1);
  const selectedSlot = slots[selectedIndex];
  const [vendor, setVendor] = useState<Pick<Vendor, 'name' | 'stall_number'> | null>(null);
  const [placing, setPlacing] = useState(false);

  const subtotal = cartSubtotal(cart);
  const total = subtotal;

  useEffect(() => {
    if (!cart.vendor_id) return; // cart empty — the empty-state branch below renders instead
    supabase.from('vendors').select('name,stall_number').eq('id', cart.vendor_id).maybeSingle()
      .then(({ data }) => setVendor(data ?? null));
  }, [cart.vendor_id]);

  async function placeOrder() {
    if (!cart.vendor_id) return;
    setPlacing(true);
    let orderId: string | null = null;
    try {
      // getSession() (not getUser()) because it's the session whose
      // access_token actually rides along on the inserts below — reading
      // identity from a separate getUser() call risks acting on a user
      // whose token isn't the one the request will carry. getSession()
      // refreshes an expired-but-refreshable token in place; a missing
      // access_token past that point means the session is truly gone.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(t('cart.signInAgainMsg'));
      const user = session.user;

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
          total_amount: total,
          payment_method: 'wallet',
          pickup_start: selectedSlot.start.toISOString(),
          pickup_end: selectedSlot.end.toISOString(),
          time_segment: timeSegmentForBangkok(selectedSlot.start),
        })
        .select('id')
        .single();
      if (orderError) throw orderError;
      orderId = order.id;

      // Insert line by line: two lines can share menu_item_id (different
      // add-on configs), so a bulk insert can't be re-correlated to its
      // cart line when attaching order_item_addons. unit_price / add-on
      // name+price are re-derived from the catalog by DB triggers; the
      // values we send are the client's snapshot and get overwritten.
      for (const line of items) {
        const { data: oi, error: itemError } = await supabase
          .from('order_items')
          .insert({ order_id: order.id, menu_item_id: line.menu_item_id, quantity: line.quantity, unit_price: line.unit_price })
          .select('id')
          .single();
        if (itemError) throw itemError;

        if (line.addons.length > 0) {
          const { error: addonError } = await supabase
            .from('order_item_addons')
            .insert(line.addons.map(a => ({
              order_item_id: oi.id,
              addon_id: a.id,
              name: a.name,
              name_th: a.name_th,
              price: a.price,
            })));
          if (addonError) throw addonError;
        }
      }

      const { error: escrowError } = await supabase
        .rpc('place_order_escrow', { p_user_id: user.id, p_order_id: order.id, p_amount: total });
      if (escrowError) throw escrowError;

      clearCart();
      router.replace(`/track/${order.id}`);
    } catch (e: any) {
      // Don't strand a pending order when checkout fails after the row was
      // inserted (rule violation / low balance). Best-effort; RLS lets a
      // student delete their own not-yet-paid order.
      if (orderId) await supabase.from('orders').delete().eq('id', orderId);
      const message = e.message === 'insufficient_wallet_balance'
        ? t('cart.insufficientBalanceMsg')
        : e.message === 'addon_rule_violation'
          ? t('cart.addonRuleMsg')
          : `${e.message}${e.code ? ` [${e.code}]` : ''}${e.details ? `\n${e.details}` : ''}${e.hint ? `\n${e.hint}` : ''}`;
      showAlert(t('cart.orderFailedTitle'), message);
    } finally {
      setPlacing(false);
    }
  }

  if (items.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 }}>
          <Tap onPress={() => router.back()}>
            <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
          </Tap>
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
          <Tap
            onPress={() => router.push('/(tabs)')}
            style={{
              backgroundColor: Brand.orange, borderRadius: 14,
              paddingHorizontal: 28, paddingVertical: 12,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('cart.browseMenu')}</Text>
          </Tap>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12 }}>
        <Tap onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
        </Tap>
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
            <View key={item.line_id}>
              {i > 0 && <View style={{ height: 1, backgroundColor: Brand.border, marginHorizontal: 16 }} />}
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: Brand.textPrimary, marginBottom: 2 }}>
                    {localizedText(item.name, item.name_th, locale)}
                  </Text>
                  <Text style={{ fontSize: 14, color: Brand.textSecondary }}>{t('cart.unitPrice', { price: item.unit_price })}</Text>
                  {item.addons.map(a => (
                    <View key={a.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                      <Text style={{ fontSize: 13, color: Brand.textSecondary }}>
                        {t('cart.addonPlus', { name: localizedText(a.name, a.name_th, locale) })}
                      </Text>
                      {a.price > 0 && (
                        <Text style={{ fontSize: 13, color: Brand.textSecondary }}>{t('item.addons.plusPrice', { price: a.price })}</Text>
                      )}
                    </View>
                  ))}
                </View>

                {/* Qty controls */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 0,
                  backgroundColor: Brand.orangeLight, borderRadius: 12, overflow: 'hidden',
                }}>
                  <Tap
                    onPress={() => setQty(item.line_id, -1)}
                    style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 18, color: Brand.orange, fontWeight: '700', lineHeight: 20 }}>−</Text>
                  </Tap>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.textPrimary, minWidth: 22, textAlign: 'center' }}>
                    {item.quantity}
                  </Text>
                  <Tap
                    onPress={() => setQty(item.line_id, 1)}
                    style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 18, color: Brand.orange, fontWeight: '700', lineHeight: 20 }}>+</Text>
                  </Tap>
                </View>

                <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary, minWidth: 52, textAlign: 'right' }}>
                  ฿{lineUnitTotal(item) * item.quantity}
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
              <Tap
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
              </Tap>
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
        <Tap
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
        </Tap>
      </View>
    </SafeAreaView>
  );
}
