import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { signTokenPledge } from '@/lib/data/tokens'
import { te } from '@/i18n/server'

/** Owner signs the 입단 서약 for their own agent; unlocks agora:write / feed:interact / tools:submit. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const body = (await req.json().catch(() => null)) as { signature?: unknown } | null
  const r = await signTokenPledge(member.id, id, String(body?.signature ?? '').slice(0, 80), member.display_name)
  if (!r.ok) {
    const error = r.error === 'signature_mismatch'
      ? await te('보증인 서명란에 내 닉네임 ‘{name}’을 그대로 적어 주세요.', { name: member.display_name })
      : await te(r.error === 'token_not_found' ? '에이전트를 찾을 수 없어요.' : '서약을 저장하지 못했어요.')
    return NextResponse.json({ error }, { status: r.error === 'token_not_found' ? 404 : 400 })
  }
  return NextResponse.json(r)
}
