import type { Locale } from '@/lib/i18n';

// Menu item names/descriptions are vendor-entered data, not app UI strings,
// so they live in DB columns (name_th/description_th) rather than the
// i18n dictionaries. Vendors aren't required to fill in the Thai column —
// fall back to the base text whenever it's missing.
export function localizedText(base: string, th: string | null | undefined, locale: Locale): string {
  if (locale === 'th' && th && th.trim()) return th;
  return base;
}
