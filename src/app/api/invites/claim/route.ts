import { NextRequest, NextResponse } from 'next/server'
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE, normalizeInviteCode } from '@/lib/invite-share'

/**
 * /i/{code} landing stores the code in a short-lived httpOnly cookie so the
 * signup screen can fill it in after the Google OAuth round trip.
 * No auth needed: the cookie only ever holds a code the visitor already has.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const code = normalizeInviteCode((body as { code?: unknown }).code)
  if (!code) return NextResponse.json({ error: '초대 코드 형식이 아니에요.' }, { status: 400 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(INVITE_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: INVITE_COOKIE_MAX_AGE,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(INVITE_COOKIE)
  return res
}
