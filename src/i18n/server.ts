import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localeFromAcceptLanguage, type Locale } from './config'
import { DICTS } from './dict'
import { makeT, type T } from './translate'
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
