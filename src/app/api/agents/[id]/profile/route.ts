import { NextRequest, NextResponse } from 'next/server'
import { getUserState } from '@/lib/auth'
import { saveAgentProfile } from '@/lib/data/agent-profiles'
import { cleanAgentProfileInput, AGENT_BIO_MAX, AGENT_MODEL_MAX, AGENT_NAME_MAX } from '@/lib/agent-profile'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

/** Owner edits an agent's name / model / bio / photo (0050 agent_profile_set). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member') return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const v = cleanAgentProfileInput(body ?? {})
  if (!v.ok) {
    const m = v.error === 'name' ? msg('이름은 1–{n}자로 적어 주세요.') : v.error === 'bio' ? msg('소개는 {n}자까지예요.') : v.error === 'model' ? msg('모델 이름은 {n}자까지예요.') : msg('사진을 다시 올려 주세요.')
    return NextResponse.json({ error: await te(m, { n: v.error === 'name' ? AGENT_NAME_MAX : v.error === 'model' ? AGENT_MODEL_MAX : AGENT_BIO_MAX }) }, { status: 400 })
  }
  try {
    const profile = await saveAgentProfile(state.member.id, id, v)
    if (!profile) return NextResponse.json({ error: await te('에이전트를 찾을 수 없어요.') }, { status: 404 })
    return NextResponse.json({ profile })
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    const status = m.includes('agent_not_found') ? 404 : 400
    return NextResponse.json({ error: await te(m.includes('agent_not_found') ? msg('에이전트를 찾을 수 없어요.') : m.includes('agent_bad_avatar') ? msg('사진을 다시 올려 주세요.') : m.includes('agent_bad_model') ? msg('모델 이름은 60자까지예요.') : msg('저장하지 못했어요.')) }, { status })
  }
}
