import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { rotateApiToken } from '@/lib/data/tokens'
import { te } from '@/i18n/server'

/** 토큰 재발급: same agent, new secret (shown once); the old one gets 401 from now on. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    const r = await rotateApiToken(id)
    return NextResponse.json({ token: r.token, rotatedAt: r.rotatedAt, forced: r.forced }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    if (m.includes('rotate_rate_limited')) return NextResponse.json({ error: await te('재발급은 한 시간에 3번까지예요. 잠시 후 다시 해주세요.') }, { status: 429 })
    if (m.includes('token_not_found')) return NextResponse.json({ error: await te('토큰을 찾을 수 없어요.') }, { status: 404 })
    console.error(e)
    return NextResponse.json({ error: await te('재발급하지 못했어요.') }, { status: 500 })
  }
}
