import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Brand } from '@/constants/theme';
import { getVendorById } from '@/lib/mock-data';
import { useCart, setQty, clearCart, cartSubtotal } from '@/lib/cart-store';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';

const TIME_SLOTS = [
  '12:00 – 12:15',
  '12:15 – 12:30',
  '12:30 – 12:45',
  '12:45 – 13:00',
  '13:00 – 13:15',
];

export default function CartScreen() {
  const { t } = useI18n();
  const cart = useCart();
  const items = cart.items;
  const [selectedSlot, setSelectedSlot] = useState(TIME_SLOTS[1]);

  const vendor = cart.vendor_id ? getVendorById(cart.vendor_id) : null;
  const subtotal = cartSubtotal(cart);
  const total = subtotal + cart.packaging_fee;

  function placeOrder() {
    showAlert(t('cart.orderPlacedTitle'), t('cart.orderPlacedMsg', { slot: selectedSlot, total }), () => {
      clearCart();
      router.replace('/(tabs)/orders');
    });
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
              <Text style={{ fontSize: 11, color: Brand.textSecondary }}>{t('cart.stall', { n: vendor.stall_number })}</Text>
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
          {TIME_SLOTS.map(slot => {
            const active = slot === selectedSlot;
            return (
              <TouchableOpacity
                key={slot}
                onPress={() => setSelectedSlot(slot)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
                  backgroundColor: active ? Brand.orange : Brand.card,
                  borderWidth: active ? 0 : 1.5, borderColor: Brand.border,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: active ? 0 : 0.03, shadowRadius: 3, elevation: active ? 0 : 1,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : Brand.textSecondary }}>
                  {slot}
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
          style={{
            backgroundColor: Brand.orange, borderRadius: 16,
            paddingVertical: 16, alignItems: 'center',
            shadowColor: Brand.orange, shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
            {t('cart.placeOrder', { total })}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>
            {t('cart.pickupAt', { slot: selectedSlot })}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
