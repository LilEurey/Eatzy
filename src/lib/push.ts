import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getUserRole } from '@/lib/user-role';

// Show banner + play sound even while the app is in the foreground, like
// LINE does — default behavior swallows it silently. iOS skips the system
// banner in foreground: components/NotificationIsland shows its own card.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: Platform.OS !== 'ios',
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Ask permission, get this device's Expo push token, store it on the user's
// row. The notify_push() DB trigger sends to it on every notifications INSERT.
// Best-effort: denied permission or Expo Go just means no push.
export async function registerForPush(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (Platform.OS === 'android') {
      // Android needs a high-importance channel for heads-up + sound.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Order updates',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      // Sign-in finishes while the Google auth browser is still on top; Android
      // silently denies a permission request from a backgrounded app, no popup.
      await untilActive();
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    // EXPO_NO_PUSH builds have no APNs entitlement, so no token to fetch —
    // permission above is still needed for NotificationIsland's local fallback.
    if (status !== 'granted' || Constants.expoConfig?.extra?.noPush === true) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('set_push_token', { p_token: token });
    if (error) throw error;
  } catch (e) {
    console.warn('push registration failed', e);
  }
}

function untilActive(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { sub.remove(); resolve(); }
    });
  });
}

// Tapping a notification (island card, system push, local fallback) opens
// the order it's about. Vendors land on their orders board (no per-order
// screen); a notification with no order falls back to the inbox.
export async function openNotification(
  n: { id?: string; order_id?: string | null; event?: string | null },
  userId: string,
): Promise<void> {
  if (n.id) void supabase.from('notifications').update({ read: true }).eq('id', n.id);
  const isVendor = n.event ? n.event === 'vendor_new_order' : (await getUserRole(userId)) === 'vendor';
  if (isVendor) router.push('/(vendor)/orders');
  else if (n.order_id) router.push(`/track/${n.order_id}`);
  else router.push('/notifications');
}

// System push / local-fallback taps. A tap that launches a killed app is
// replayed by openLaunchNotification() once auth routing has landed on the
// role's home screen — routeAfterAuth's replace() would wipe an earlier push.
// Until then live taps are ignored (that same launch tap can arrive here too),
// and identifiers dedupe the two paths.
const handledTaps = new Set<string>();
let launchHandled = false;

function openTap(r: Notifications.NotificationResponse, userId: string) {
  const id = r.notification.request.identifier;
  if (handledTaps.has(id)) return;
  handledTaps.add(id);
  void openNotification(r.notification.request.content.data as Parameters<typeof openNotification>[0], userId);
}

export function onNotificationTap(r: Notifications.NotificationResponse, userId: string): void {
  if (launchHandled) openTap(r, userId);
}

export async function openLaunchNotification(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  launchHandled = true;
  const r = await Notifications.getLastNotificationResponseAsync();
  if (r) openTap(r, userId);
}
