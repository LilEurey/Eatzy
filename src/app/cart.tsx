import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { useCart, setQty, setNote, clearCart, cartSubtotal, lineUnitTotal, NOTE_MAX } from '@/lib/cart-store';
import { usePreferences, matchLineAllergens } from '@/hooks/usePreferences';
import { showAlert, showConfirm } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';
import { nextPickupSlots, isStoreOpen } from '@/lib/time';
import { formatBaht } from '@/lib/money';
import { placeOrder as placeOrderInDb } from '@/lib/place-order';
import type { Database } from '@/types/database.types';

type Vendor = Database['public']['Tables']['vendors']['Row'];

export default function CartScreen() {
  const { t, locale } = useI18n();
  const { prefs, loading: prefsLoading, error: prefsError } = usePreferences();
  const cart = useCart();
  const items = cart.items;

  // Allergens the student listed that appear on a line (base dish or any of its
  // add-ons). The Add to Cart popup on item/[id] is a one-time gate; this keeps
  // the warning present on the cart and at checkout.
  const lineAllergens = (line: (typeof items)[number]) =>
    matchLineAllergens(line.allergens, line.addons.flatMap(a => a.allergens), prefs);
  const orderAllergens = [...new Set(items.flatMap(lineAllergens))];
  // Computed once per visit (not on every render) so the offered windows
  // don't shift under the student while they're picking one — real "next
  // available" slots rolling from right now in Thailand time, not a fixed
  // noon-only list. Re-rolled at submit if the picked one has already
  // started (cart left open), since place_order rejects past windows.
  const [slots, setSlots] = useState(() => nextPickupSlots());
  const [selectedIndex, setSelectedIndex] = useState(1);
  const selectedSlot = slots[selectedIndex];
  const [vendor, setVendor] = useState<Pick<Vendor, 'name' | 'stall_number' | 'is_open' | 'open_time' | 'close_time'> | null>(null);
  const [placing, setPlacing] = useState(false);

  const subtotal = cartSubtotal(cart);
  const total = subtotal;

  useEffect(() => {
    if (!cart.vendor_id) return; // cart empty — the empty-state branch below renders instead
    supabase.from('vendors').select('name,stall_number,is_open,open_time,close_time').eq('id', cart.vendor_id).maybeSingle()
      .then(({ data }) => setVendor(data ?? null));
  }, [cart.vendor_id]);

  function placeOrder() {
    if (!cart.vendor_id) return;
    // Allergy prefs must be loaded (and correct) before checkout can decide
    // whether to warn — proceeding on stale/default prefs would silently
    // skip the allergen confirm for a student whose prefs failed to load.
    if (prefsLoading || prefsError) {
      showAlert(t('cart.orderFailedTitle'), t('cart.prefsNotReadyMsg'));
      return;
    }
    if (vendor && !isStoreOpen(vendor)) {
      showAlert(t('cart.storeClosedTitle'), t('cart.storeClosedMsg'));
      return;
    }
    if (orderAllergens.length > 0) {
      showConfirm(
        t('cart.allergyConfirmTitle'),
        t('cart.allergyConfirmMsg', { allergens: orderAllergens.join(', ') }),
        () => { void submitOrder(); },
        { confirmLabel: t('cart.placeAnyway'), cancelLabel: t('common.cancel'), destructive: true },
      );
      return;
    }
    void submitOrder();
  }

  async function submitOrder() {
    if (!cart.vendor_id) return;
    if (selectedSlot.start.getTime() <= Date.now()) {
      setSlots(nextPickupSlots());
      showAlert(t('cart.orderFailedTitle'), t('cart.slotExpiredMsg'));
      return;
    }
    setPlacing(true);
    try {
      const result = await placeOrderInDb({
        vendorId: cart.vendor_id,
        lines: items,
        slot: selectedSlot,
      });
      if (result.ok) {
        clearCart();
        router.replace(`/track/${result.orderId}`);
        return;
      }
      if (result.reason === 'slot-expired') setSlots(nextPickupSlots());
      const message = result.reason === 'no-session' ? t('cart.signInAgainMsg')
        : result.reason === 'vendor-closed' ? t('cart.storeClosedMsg')
        : result.reason === 'item-unavailable' ? t('cart.itemUnavailableMsg')
        : result.reason === 'slot-expired' ? t('cart.slotExpiredMsg')
        : result.message;
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

        {orderAllergens.length > 0 && (
          <View style={{
            backgroundColor: '#fee2e2', borderRadius: 12, borderWidth: 1, borderColor: '#fecaca',
            paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20,
          }}>
            <Text style={{ fontSize: 13, color: '#b91c1c', fontWeight: '700' }}>
              {t('cart.allergyBanner')}
            </Text>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, gap: 14 }}>
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
                  {lineAllergens(item).length > 0 && (
                    <Text style={{ fontSize: 12, color: '#b91c1c', fontWeight: '700', marginTop: 4 }}>
                      {t('cart.allergyLineWarning', { allergens: lineAllergens(item).join(', ') })}
                    </Text>
                  )}
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
                  ฿{formatBaht(lineUnitTotal(item) * item.quantity)}
                </Text>
              </View>

              {/* Per-line message to the kitchen — written to order_items.special_instructions */}
              <TextInput
                value={item.note}
                onChangeText={v => setNote(item.line_id, v)}
                maxLength={NOTE_MAX}
                multiline
                placeholder={t('cart.noteToVendor')}
                placeholderTextColor={Brand.textSecondary}
                style={{
                  marginHorizontal: 16, marginTop: 10, marginBottom: 16,
                  backgroundColor: Brand.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
                  fontSize: 13, color: Brand.textPrimary, minHeight: 40, textAlignVertical: 'top',
                }}
              />
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
            <Text style={{ fontSize: 14, color: Brand.textPrimary, fontWeight: '600' }}>฿{formatBaht(subtotal)}</Text>
          </View>
          <View style={{ height: 1, backgroundColor: Brand.border }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: Brand.textPrimary }}>{t('common.total')}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: Brand.orange }}>฿{formatBaht(total)}</Text>
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
          disabled={placing || prefsLoading || prefsError}
          style={{
            backgroundColor: Brand.orange, borderRadius: 16,
            paddingVertical: 16, alignItems: 'center', opacity: (placing || prefsLoading || prefsError) ? 0.7 : 1,
            shadowColor: Brand.orange, shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
          }}
        >
          {placing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                {t('cart.placeOrder', { total: formatBaht(total) })}
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
