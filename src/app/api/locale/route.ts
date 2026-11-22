import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { sb, useMockData as isMock } from '@/lib/data/client'
import { LOCALE_COOKIE, isLocale } from '@/i18n/config'
import { te } from '@/i18n/server'

/**
 * Switch the UI language. Always sets the cookie (works signed out, e.g. the
 * landing and /i/{code}); members also get it saved on their profile so other
 * devices pick it up.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { locale?: unknown } | null
  const locale = body?.locale
  if (!isLocale(locale)) return NextResponse.json({ error: await te('unsupported locale') }, { status: 400 })
  let saved = false
  if (!isMock()) {
    const member = await getMember().catch(() => null)
    if (member) {
      const supabase = await sb()
      const { error } = await supabase.rpc('member_set_locale', { p_locale: locale })
      saved = !error
    }
  }
  const res = NextResponse.json({ ok: true, locale, saved })
  res.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  return res
}
