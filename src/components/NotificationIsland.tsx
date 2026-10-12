import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { notificationText } from '@/lib/localize';
import { Brand } from '@/constants/theme';
import { useDynamicNotifications } from '@/dynamic-island/hooks';

const SYMBOLS: Record<string, { symbol: SymbolViewProps['name']; accent: string }> = {
  order_accepted:   { symbol: 'checkmark.circle.fill', accent: '#34C759' },
  order_ready:      { symbol: 'bag.fill', accent: Brand.orange },
  order_rejected:   { symbol: 'xmark.circle.fill', accent: '#FF3B30' },
  order_refunded:   { symbol: 'arrow.uturn.backward.circle.fill', accent: '#FF9500' },
  order_completed:  { symbol: 'star.fill', accent: '#FFCC00' },
  vendor_new_order: { symbol: 'bell.badge.fill', accent: Brand.orange },
};

// Every notifications INSERT for the signed-in user pops the Dynamic Island
// card while the app is foregrounded on iOS. Background delivery stays with
// the system push (lib/push.ts), which suppresses its own iOS foreground
// banner so the two don't double up.
export function NotificationIsland({ userId }: { userId: string | undefined }) {
  const { trigger } = useDynamicNotifications();
  const { t } = useI18n();

  useEffect(() => {
    if (Platform.OS !== 'ios' || !userId) return;
    const channel = supabase
      .channel(`island-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as Parameters<typeof notificationText>[0];
        const { title, body } = notificationText(n, t);
        const style = (n.event && SYMBOLS[n.event]) || { symbol: 'bell.fill', accent: Brand.orange };
        const isVendor = n.event === 'vendor_new_order';
        trigger({
          title,
          message: body,
          ...style,
          onPress: () => router.push(isVendor ? '/(vendor)/orders' : '/notifications'),
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, t, trigger]);

  return null;
}
