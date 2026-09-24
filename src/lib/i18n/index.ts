import { createContext, useContext, useEffect, useMemo, useState, createElement, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { en, type TranslationKey } from './en';
import { th } from './th';

export type Locale = 'en' | 'th';

const STORAGE_KEY = 'eatzy.locale';

const translations: Record<Locale, Record<TranslationKey, string>> = { en, th };

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  th: 'ไทย',
};

type TranslateFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

function translate(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  const template = translations[locale][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// Locale for code outside the React tree (module-level stores like
// vendor-store.ts that raise alerts). Kept in step by I18nProvider.
let activeLocale: Locale = 'en';

/** t() for non-component code — uses whichever locale the provider last set. */
export function translateActive(key: TranslationKey, params?: Record<string, string | number>): string {
  return translate(activeLocale, key, params);
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'en' || stored === 'th') setLocaleState(stored);
    });
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  }

  useEffect(() => { activeLocale = locale; }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (key, params) => translate(locale, key, params),
  }), [locale]);

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}

export type { TranslationKey };
