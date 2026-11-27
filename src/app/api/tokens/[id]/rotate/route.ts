import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { cancelRotateApiToken, rotateApiToken } from '@/lib/data/tokens'
import { te } from '@/i18n/server'

/** Prepare a new secret: the old one stays valid until the new token connects or the owner confirms. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    const r = await rotateApiToken(id)
    return NextResponse.json(
      { token: r.token, preparedAt: r.preparedAt, pending: true, forced: r.forced },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    if (m.includes('rotate_rate_limited')) return NextResponse.json({ error: await te('재발급은 한 시간에 3번까지예요. 잠시 후 다시 해주세요.') }, { status: 429 })
    if (m.includes('token_not_found')) return NextResponse.json({ error: await te('토큰을 찾을 수 없어요.') }, { status: 404 })
    console.error(e)
    return NextResponse.json({ error: await te('재발급하지 못했어요.') }, { status: 500 })
  }
}

/** Cancel a prepared rotation; the current secret keeps working. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    await cancelRotateApiToken(id)
    return NextResponse.json({ ok: true, pending: false }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    if (m.includes('token_not_found')) return NextResponse.json({ error: await te('토큰을 찾을 수 없어요.') }, { status: 404 })
    console.error(e)
    return NextResponse.json({ error: await te('재발급을 취소하지 못했어요.') }, { status: 500 })
  }
}
