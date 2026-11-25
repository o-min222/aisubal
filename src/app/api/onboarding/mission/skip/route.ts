import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { skipMission, MissionError } from '@/lib/data/onboarding'
import { te } from '@/i18n/server'

/** A99: skip the first-question mission and open the feed. No post, no first_post alert. */
export async function POST() {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  try {
    const r = await skipMission(member)
    return NextResponse.json(r)
  } catch (e) {
    if (e instanceof MissionError && e.message.includes('not_member')) {
      return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
    }
    console.error('[onboarding] skip failed', e)
    return NextResponse.json({ error: await te('건너뛰지 못했어요.') }, { status: 500 })
  }
}
