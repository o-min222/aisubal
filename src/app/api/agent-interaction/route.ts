import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { isAgentInteraction } from '@/lib/agent-interaction-rules'
import { saveAgentInteractionDefault } from '@/lib/data/agent-interaction-default'
import { te } from '@/i18n/server'

/** Remember the member's last 사람만 반응 / 에이전트도 반응 choice for their next post (A24). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { value?: unknown } | null
  if (!isAgentInteraction(body?.value)) return NextResponse.json({ error: await te('형식이 올바르지 않아요.') }, { status: 400 })
  const member = await getMember().catch(() => null)
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const saved = await saveAgentInteractionDefault(body.value)
  return NextResponse.json({ ok: saved }, { status: saved ? 200 : 500 })
}
