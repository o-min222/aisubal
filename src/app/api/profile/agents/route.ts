import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { saveMemberAgents } from '@/lib/data/profile-stack'
import { validateAgents } from '@/lib/profile-stack'
import { te } from '@/i18n/server'

/** Replace-all save of 내 에이전트 (agents the member uses or runs). */
export async function PUT(req: Request) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { agents?: unknown } | null
  const v = validateAgents(body?.agents)
  if (!v.ok) return NextResponse.json({ error: await te(v.error) }, { status: 400 })
  try {
    await saveMemberAgents(member.id, v.agents)
    return NextResponse.json({ ok: true, count: v.agents.length })
  } catch {
    return NextResponse.json({ error: await te('저장하지 못했어요. 입력값을 확인해 주세요.') }, { status: 400 })
  }
}
