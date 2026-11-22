import { DEFAULT_LOCALE, type Locale } from './config'

/** Korean source text → translation. Missing entries fall back to the Korean source. */
export type Dict = Readonly<Record<string, string>>
export type Vars = Record<string, string | number>
export type T = (source: string, vars?: Vars) => string

export function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

export function makeT(locale: Locale, dict: Dict | null): T {
  if (locale === DEFAULT_LOCALE || !dict) return (s, vars) => interpolate(s, vars)
  return (s, vars) => interpolate(dict[s] ?? s, vars)
}

/**
 * Marks a Korean source string that is stored now and translated later with
 * t(value) (nav labels, hints, reasons). Identity at runtime; tests/i18n.test.ts
 * collects msg('…') and t('…') literals to check every locale covers them.
 */
export const msg = <S extends string>(s: S): S => s
