import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import type { SymbolViewProps } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import { notificationText } from '@/lib/localize';
import { openNotification } from '@/lib/push';
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
// EXPO_NO_PUSH builds (free Apple team, no APNs) have no system push, so a
// backgrounded app posts a local notification instead.
// ponytail: only fires while iOS keeps the realtime socket alive (~30s after
// backgrounding); a killed app gets nothing. Real fix is a paid team + APNs.
const NO_PUSH = Constants.expoConfig?.extra?.noPush === true;

export function NotificationIsland({ userId }: { userId: string | undefined }) {
  const { trigger } = useDynamicNotifications();
  const { t } = useI18n();

  useEffect(() => {
    if (Platform.OS !== 'ios' || !userId) return;
    const channel = supabase
      .channel(`island-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as Parameters<typeof notificationText>[0] & { id: string; order_id: string | null };
        const { title, body } = notificationText(n, t);
        const style = (n.event && SYMBOLS[n.event]) || { symbol: 'bell.fill', accent: Brand.orange };
        const target = { id: n.id, order_id: n.order_id, event: n.event };
        if (NO_PUSH && AppState.currentState !== 'active') {
          void Notifications.scheduleNotificationAsync({ content: { title, body, sound: true, data: target }, trigger: null });
          return;
        }
        trigger({
          title,
          message: body,
          ...style,
          onPress: () => void openNotification(target, userId),
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, t, trigger]);

  // System push / local-fallback taps, any platform.
  // ponytail: warm taps only — a cold-start tap lands on the role home screen,
  // since routeAfterAuth replaces the stack; add getLastNotificationResponseAsync
  // after auth routing settles if that matters.
  useEffect(() => {
    if (Platform.OS === 'web' || !userId) return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      void openNotification(r.notification.request.content.data as Parameters<typeof openNotification>[0], userId);
    });
    return () => sub.remove();
  }, [userId]);

  return null;
}
