import { Text } from 'react-native';
import { router } from 'expo-router';
import { Tap } from '@/components/Tap';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { useCart, cartCount, cartSubtotal } from '@/lib/cart-store';
import { formatBaht } from '@/lib/money';

/** "Basket • n items ฿x" pill — opens the cart. Renders nothing unless the cart holds items from `vendorId`. */
export function CartBar({ vendorId }: { vendorId: string }) {
  const { t } = useI18n();
  const cart = useCart();
  if (cart.vendor_id !== vendorId || cart.items.length === 0) return null;
  return (
    <Tap
      onPress={() => router.push('/cart')}
      style={{ height: 56, borderRadius: 28, backgroundColor: Brand.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 }}
    >
      <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{t('store.basket', { n: cartCount(cart) })}</Text>
      <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{formatBaht(cartSubtotal(cart))}</Text>
    </Tap>
  );
}
