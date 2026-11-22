import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { changeHandle, handleAvailable, handleStatus } from '@/lib/data/profile'
import { validateHandle } from '@/lib/profile-rules'
import { CHECK_LABEL, HANDLE_ERRORS, formatHandleDate, handleErrorCode } from '@/lib/handle-policy'
import { msg } from '@/i18n/translate'
import { getLocale, te } from '@/i18n/server'

const noStore = { headers: { 'Cache-Control': 'no-store' } }

/**
 * GET ?h= — live check for the @handle field: { available, reason } (onboarding form) plus the
 * policy status { current, quota, check, history } for the inline editor. History is my own only.
 */
export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const raw = request.nextUrl.searchParams.get('h') || ''
  const status = await handleStatus(member, raw || null).catch(() => null)
  if (status) {
    const st = status.check?.state
    const available = st === 'available' || st === 'same' || st === 'own_hold'
    return NextResponse.json({ ...status, available, handle: status.check?.handle ?? null, reason: st && !available ? await te(CHECK_LABEL[st]) : null }, noStore)
  }
  // fallback (status RPC unavailable): plain format + availability
  const v = validateHandle(raw)
  if (!v.ok) return NextResponse.json({ available: false, reason: await te(v.reason) }, noStore)
  const available = v.handle === member.handle || (await handleAvailable(v.handle).catch(() => false))
  return NextResponse.json({ available, handle: v.handle, reason: available ? null : await te(msg('이미 쓰는 핸들이에요.')) }, noStore)
}

/** POST { handle } — change under the policy (2 per rolling 14 days, old handle held 14 days). */
export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { handle?: unknown } | null
  const v = validateHandle(typeof body?.handle === 'string' ? body.handle : '')
  if (!v.ok) return NextResponse.json({ error: await te(v.reason), code: 'profile_handle_invalid' }, { status: 400 })
  try {
    return NextResponse.json(await changeHandle(member, v.handle), noStore)
  } catch (e) {
    const err = e as Error & { details?: string | null }
    const code = handleErrorCode(err.message || '')
    if (!code) return NextResponse.json({ error: await te('저장하지 못했어요.') }, { status: 500 })
    const date = formatHandleDate(err.details, await getLocale())
    return NextResponse.json({ error: await te(HANDLE_ERRORS[code], { date }), code, nextAt: code === 'handle_change_cooldown' ? err.details ?? null : null }, { status: code === 'handle_change_cooldown' ? 429 : 409 })
  }
}
