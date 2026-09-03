import type { TranslationKey } from '@/lib/i18n';

type TranslateFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

/**
 * Short "time since" label: "just now" / "5m ago" / "3h ago" / "2d ago" /
 * "3w ago" / "5mo ago". Caps at months — anything older still reads as months.
 * Kept in one place so notification lists and review cards format the same way.
 */
export function timeAgo(iso: string, t: TranslateFn): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t('common.justNow');
  if (diff < 3600) return t('common.minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('common.hoursAgo', { n: Math.floor(diff / 3600) });
  if (diff < 604800) return t('common.daysAgo', { n: Math.floor(diff / 86400) });
  if (diff < 2592000) return t('common.weeksAgo', { n: Math.floor(diff / 604800) });
  return t('common.monthsAgo', { n: Math.floor(diff / 2592000) });
}
