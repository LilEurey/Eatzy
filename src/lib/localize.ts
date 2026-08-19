import type { Locale, TranslationKey } from '@/lib/i18n';

// Menu item names/descriptions are vendor-entered data, not app UI strings,
// so they live in DB columns (name_th/description_th) rather than the
// i18n dictionaries. Vendors aren't required to fill in the Thai column —
// fall back to the base text whenever it's missing.
export function localizedText(base: string, th: string | null | undefined, locale: Locale): string {
  if (locale === 'th' && th && th.trim()) return th;
  return base;
}

type NotificationEvent = 'order_accepted' | 'order_ready' | 'order_rejected' | 'order_completed' | 'vendor_new_order';

const NOTIF_KEYS: Record<NotificationEvent, { title: TranslationKey; body: TranslationKey }> = {
  order_accepted:   { title: 'notif.orderAccepted.title',  body: 'notif.orderAccepted.body' },
  order_ready:      { title: 'notif.orderReady.title',     body: 'notif.orderReady.body' },
  order_rejected:   { title: 'notif.orderRejected.title',  body: 'notif.orderRejected.body' },
  order_completed:  { title: 'notif.orderCompleted.title', body: 'notif.orderCompleted.body' },
  vendor_new_order: { title: 'notif.vendorNewOrder.title', body: 'notif.vendorNewOrder.body' },
};

// notify_order_status_change() / notify_vendor_new_order() (supabase/migrations)
// snapshot event + params at insert time instead of pre-rendered English text,
// so this can render in whatever locale is active now, not whichever locale
// was active when the DB trigger fired.
export function notificationText(
  n: { event: string | null; title: string; body: string; vendor_name: string | null; queue_number: number | null; total_amount: number | null },
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): { title: string; body: string } {
  const keys = n.event && n.event in NOTIF_KEYS ? NOTIF_KEYS[n.event as NotificationEvent] : null;
  if (!keys) return { title: n.title, body: n.body };
  const params = {
    vendor: n.vendor_name ?? '',
    queue: n.queue_number != null ? String(n.queue_number) : '—',
    amount: n.total_amount != null ? String(n.total_amount) : '',
  };
  return { title: t(keys.title, params), body: t(keys.body, params) };
}
