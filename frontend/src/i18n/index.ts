// Lightweight in-house i18n — no third-party library.
// A single dictionary per locale + a `t()` lookup with {var} interpolation.
// Default locale is English; adding more locales later is just another entry
// in `locales` plus a `setLocale()` call.

import { zh } from './zh';
import { en } from './en';

type Dict = Record<string, unknown>;

export const LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

const locales: Record<string, Dict> = { zh, en };
let current: string = 'en';

export function setLocale(locale: string) {
  if (locales[locale]) current = locale;
}

export function getLocale() {
  return current;
}

function lookup(dict: Dict, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, dict);
}

/**
 * Translate a dot-path key for the active locale.
 * @param key      e.g. "stage.pause"
 * @param vars     interpolation values for {placeholders}
 * @param fallback returned when the key is missing (defaults to the key)
 */
export function t(
  key: string,
  vars?: Record<string, string | number>,
  fallback?: string,
): string {
  const found = lookup(locales[current], key);
  if (typeof found !== 'string' && fallback === undefined && process.env.NODE_ENV !== 'production') {
    // Surface missing keys in dev so a typo or a key added to one locale but
    // not another doesn't silently ship as the raw key string.
    console.warn(`[i18n] missing key "${key}" for locale "${current}"`);
  }
  let s = typeof found === 'string' ? found : fallback ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.split(`{${k}}`).join(String(vars[k]));
    }
  }
  return s;
}
