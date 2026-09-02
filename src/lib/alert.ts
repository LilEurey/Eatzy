import { Alert, Platform } from 'react-native';
import type { useI18n } from '@/lib/i18n';

// react-native-web ships `class Alert { static alert() {} }` — a no-op stub —
// so anything inside an Alert button callback never runs on web. Route every
// alert through here: window.alert on web (then run the callback), real Alert on native.
export function showAlert(title: string, message?: string, onOk?: () => void) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    onOk?.();
  } else {
    Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
  }
}

// Placeholder alert for features not built yet — same title/message pair
// used by every "coming soon" button across student and vendor screens.
export function comingSoonAlert(t: ReturnType<typeof useI18n>['t']) {
  showAlert(t('common.comingSoonTitle'), t('common.comingSoonMsg'));
}

// Two-way confirm (Cancel vs. proceed) — same web/native split as showAlert,
// since react-native-web's Alert.alert stub never fires button callbacks.
// confirmLabel defaults to a plain "OK" wording; pass one for destructive/
// warning actions (e.g. "Add Anyway") so the button reads as a choice, not
// an acknowledgement.
export function showConfirm(
  title: string,
  message: string | undefined,
  onConfirm: () => void,
  options?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean },
) {
  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: options?.cancelLabel ?? 'Cancel', style: 'cancel' },
      { text: options?.confirmLabel ?? 'OK', style: options?.destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  }
}
