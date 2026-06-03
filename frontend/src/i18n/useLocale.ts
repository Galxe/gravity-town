'use client';

import { create } from 'zustand';
import { getLocale, setLocale as applyLocale, LOCALES, type Locale } from './index';

const STORAGE_KEY = 'arena_locale';

type LocaleState = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  hydrate: () => void;
};

/**
 * Global locale store. `t()` reads the active locale from the i18n module; this
 * store keeps that module in sync AND gives components a reactive value to
 * subscribe to so they re-render when the language changes.
 *
 * SSR-safe: the initial value matches the module default ('en'), so the first
 * client render agrees with the server. `hydrate()` (called once on mount)
 * then applies any saved preference from localStorage.
 */
export const useLocale = create<LocaleState>((set) => ({
  locale: getLocale() as Locale,
  setLocale: (l) => {
    applyLocale(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    set({ locale: l });
  },
  hydrate: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && (LOCALES as readonly string[]).includes(saved)) {
        applyLocale(saved);
        set({ locale: saved as Locale });
      }
    } catch { /* ignore */ }
  },
}));
