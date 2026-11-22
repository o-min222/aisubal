import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { setFeedAgentInteraction } from '@/lib/data/feed'
import { isFeedId } from '@/lib/feed-ids'
import { te } from '@/i18n/server'

const schema = z.object({ agentInteraction: z.enum(['humans_only', 'agents_allowed']) })

/** Author-only: change who may interact with a root post. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: await te('잘못된 게시물입니다.') }, { status: 400 })
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: await te('잘못된 설정값입니다.') }, { status: 400 })
  const ok = await setFeedAgentInteraction(id, member, parsed.data.agentInteraction)
  if (!ok) return NextResponse.json({ error: await te('내 원글만 바꿀 수 있어요.') }, { status: 403 })
  return NextResponse.json({ agentInteraction: parsed.data.agentInteraction })
}
