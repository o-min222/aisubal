import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localeFromAcceptLanguage, type Locale } from './config'
import { DICTS } from './dict'
import { interpolate, makeT, type T } from './translate'
import { getUserState } from '@/lib/auth'

/**
 * Locale for this request: explicit choice cookie → the member's saved profile
 * choice (new device) → Accept-Language on the first visit → Korean.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies()
  const c = jar.get(LOCALE_COOKIE)?.value
  if (isLocale(c)) return c
  try {
    const state = await getUserState()
    const saved = state.type === 'member' ? state.member.locale : null
    if (isLocale(saved)) return saved
  } catch {
    // signed out or DB hiccup: fall through to the browser language
  }
  const h = await headers()
  return localeFromAcceptLanguage(h.get('accept-language')) ?? DEFAULT_LOCALE
})

export const getT = cache(async (): Promise<T> => makeT(await getLocale(), DICTS[await getLocale()]))

/**
 * Translate a user-facing server message (API `{ error }`, thrown data-layer
 * errors, validation messages) into the request's locale. Messages are Korean
 * source text marked with msg(); unknown text (e.g. raw DB errors) passes through.
 */
export async function te(message: string, vars?: Parameters<T>[1]): Promise<string> {
  try {
    return (await getT())(message, vars)
  } catch (e) {
    // called outside a request (unit tests, scripts): keep the Korean source.
    // Anything else (e.g. Next's dynamic-rendering bailout) must propagate.
    if (e instanceof Error && e.message.includes('outside a request scope')) return interpolate(message, vars)
    throw e
  }
}
