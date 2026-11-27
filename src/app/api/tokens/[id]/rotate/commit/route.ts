import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { commitRotateApiToken } from '@/lib/data/tokens'
import { te } from '@/i18n/server'

/** Retire the previous secret now, even if the new one has not connected yet. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    const r = await commitRotateApiToken(id)
    return NextResponse.json({ ok: true, rotatedAt: r.rotatedAt, pending: false }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    if (m.includes('rotate_not_pending')) return NextResponse.json({ error: await te('재발급 대기 중인 토큰이 없어요.') }, { status: 400 })
    if (m.includes('token_not_found')) return NextResponse.json({ error: await te('토큰을 찾을 수 없어요.') }, { status: 404 })
    console.error(e)
    return NextResponse.json({ error: await te('이전 토큰을 만료하지 못했어요.') }, { status: 500 })
  }
}
