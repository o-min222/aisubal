/**
 * Locales. Korean is the source language: UI strings are written in Korean and
 * looked up by that exact text in the other dictionaries (gettext style), so a
 * missing translation falls back to Korean instead of a broken key.
 *
 * Adding a language (e.g. Japanese):
 *   1. add 'ja' to LOCALES and LOCALE_META below
 *   2. create src/i18n/dict/ja.ts (copy en.ts, translate the values)
 *   3. register it in src/i18n/dict/index.ts
 * tests/i18n.test.ts then fails until every t('…') string in the code has an entry.
 */
export const LOCALES = ['ko', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'ko'
/** Cookie-based locale: URLs never change, so /i/{code} and every route stay stable. */
export const LOCALE_COOKIE = 'aisubal_locale'

export const LOCALE_META: Record<Locale, { native: string; htmlLang: string; og: string; intl: string }> = {
  ko: { native: '한국어', htmlLang: 'ko', og: 'ko_KR', intl: 'ko-KR' },
  en: { native: 'English', htmlLang: 'en', og: 'en_US', intl: 'en-US' },
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v)
}

/** First supported language in an Accept-Language header (q-weighted), else null. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null
  const prefs = header
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      return { base: tag.trim().toLowerCase().split('-')[0], q: q ? Number(q.slice(2)) || 0 : 1, i }
    })
    .filter((p) => p.base && p.base !== '*' && p.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
  for (const p of prefs) if (isLocale(p.base)) return p.base
  return null
}
