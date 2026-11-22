'use client'

import { createContext, use, useContext, useEffect, useMemo } from 'react'
import { DEFAULT_LOCALE, type Locale } from './config'
import { makeT, type Dict, type T, type Vars } from './translate'

/** The browser's active translator, for event handlers (see tn). */
let current: T = makeT(DEFAULT_LOCALE, null)

const Ctx = createContext<{ locale: Locale; t: T }>({ locale: DEFAULT_LOCALE, t: makeT(DEFAULT_LOCALE, null) })

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dict | null; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale, dict) }), [locale, dict])
  useEffect(() => {
    current = value.t
  }, [value])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useT = (): T => useContext(Ctx).t
export const useLocale = (): Locale => useContext(Ctx).locale

/**
 * Translate in client code. During render it reads the provider through React's
 * use() (allowed inside loops/conditions, unlike hooks); outside render — event
 * handlers, toasts, confirm() — React has no dispatcher and use() throws, so it
 * falls back to the browser's active translator (tn).
 */
export function tx(source: string, vars?: Vars): string {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return use(Ctx).t(source, vars)
  } catch {
    return current(source, vars)
  }
}

/**
 * Translate now — for event handlers, toasts and confirm() dialogs, where
 * neither hooks nor use() can run. Browser-only: never call it while rendering.
 */
export function tn(source: string, vars?: Vars): string {
  return current(source, vars)
}
