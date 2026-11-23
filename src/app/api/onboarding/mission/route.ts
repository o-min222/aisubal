import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { completeMission, MissionError } from '@/lib/data/onboarding'
import { missionAnswerError } from '@/lib/onboarding-rules'
import { getLocale, te } from '@/i18n/server'

const schema = z.object({ answer: z.string().max(4000) })

/** A54: answer the first question → it becomes the first post (전체 회원) and the feed opens. */
export async function POST(req: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: await te('요청 형식이 올바르지 않아요.') }, { status: 400 })
  const bad = missionAnswerError(parsed.data.answer)
  if (bad) return NextResponse.json({ error: await te(bad) }, { status: 400 })
  try {
    const r = await completeMission(member, parsed.data.answer, (await getLocale()) === 'en' ? 'en' : 'ko')
    return NextResponse.json(r, { status: 201 })
  } catch (e) {
    if (e instanceof MissionError && e.message.includes('mission_bad_answer')) {
      return NextResponse.json({ error: await te('조금만 더 적어 주세요 (10자 이상).') }, { status: 400 })
    }
    console.error('[onboarding] mission failed', e)
    return NextResponse.json({ error: await te('게시하지 못했어요.') }, { status: 500 })
  }
}
