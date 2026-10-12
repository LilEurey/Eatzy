import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

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
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    // EXPO_NO_PUSH builds have no APNs entitlement, so no token to fetch —
    // permission above is still needed for NotificationIsland's local fallback.
    if (status !== 'granted' || Constants.expoConfig?.extra?.noPush === true) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.rpc('set_push_token', { p_token: token });
  } catch (e) {
    console.warn('push registration failed', e);
  }
}
