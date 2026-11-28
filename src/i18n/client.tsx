'use client'

import { createContext, use, useContext, useEffect, useMemo } from 'react'
import { DEFAULT_LOCALE, type Locale } from './config'
import { makeT, type Dict, type T, type Vars } from './translate'

/**
 * A149: the browser's dictionary is the shell (root layout) plus each area namespace a segment
 * layout has rendered (I18nArea). Translations never conflict, so the browser keeps a growing union
 * for event-handler translations (tn); render-time translations read the nearest provider.
 */
const loaded: Record<string, string> = {}
const remember = (dict: Dict | null) => {
  if (dict && typeof window !== 'undefined') Object.assign(loaded, dict)
}

/** The browser's active translator, for event handlers (see tn). */
let current: T = makeT(DEFAULT_LOCALE, null)

type Value = { locale: Locale; dict: Dict | null; t: T }
const Ctx = createContext<Value>({ locale: DEFAULT_LOCALE, dict: null, t: makeT(DEFAULT_LOCALE, null) })

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dict | null; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, dict, t: makeT(locale, dict) }), [locale, dict])
  remember(dict)
  useEffect(() => {
    current = makeT(locale, dict ? loaded : null)
  }, [locale, dict])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Adds one area's namespace (sent by its segment layout) on top of the shell. */
export function I18nExtend({ dict, children }: { dict: Dict | null; children: React.ReactNode }) {
  const parent = useContext(Ctx)
  const value = useMemo(() => {
    if (!dict || !parent.dict) return parent
    const merged = { ...parent.dict, ...dict }
    return { locale: parent.locale, dict: merged, t: makeT(parent.locale, merged) }
  }, [parent, dict])
  remember(dict)
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
