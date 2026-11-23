import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { sb, isMock } from '@/lib/data/client'
import { THEME_COOKIE, isTheme } from '@/lib/theme'
import { te } from '@/i18n/server'

/** Set the color theme: always the cookie; members also on their profile (other devices). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { theme?: unknown } | null
  const theme = body?.theme
  if (!isTheme(theme)) return NextResponse.json({ error: await te('형식이 올바르지 않아요.') }, { status: 400 })
  let saved = false
  if (!isMock()) {
    const member = await getMember().catch(() => null)
    if (member) {
      const supabase = await sb()
      const { error } = await supabase.rpc('member_set_theme', { p_theme: theme })
      saved = !error
    }
  }
  const res = NextResponse.json({ ok: true, theme, saved })
  res.cookies.set(THEME_COOKIE, theme, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  return res
}
