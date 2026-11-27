import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { listApiTokens } from '@/lib/data/tokens'
import { cleanupOnboardingTest, getOnboardingStatus, startOnboardingTest } from '@/lib/data/agent-onboard'
import { onboardHandle } from '@/lib/agent-onboard'
import { getLocale, te } from '@/i18n/server'

const NO_STORE = { 'Cache-Control': 'no-store' }

async function fail(e: unknown) {
  const m = e instanceof Error ? e.message : ''
  if (m.includes('token_not_found') || m.includes('api_unauthorized')) {
    return NextResponse.json({ error: await te('토큰을 찾을 수 없어요.') }, { status: 404 })
  }
  if (m.includes('agent_needs_name')) {
    return NextResponse.json({ error: await te('에이전트 이름을 정해주세요.') }, { status: 400 })
  }
  if (m.includes('api_rate_limited')) {
    return NextResponse.json({ error: await te('테스트는 한 시간에 10번까지예요.') }, { status: 429 })
  }
  console.error(e)
  return NextResponse.json({ error: await te('연결 상태를 불러오지 못했어요.') }, { status: 500 })
}

async function ownToken(memberId: string, id: string) {
  const tokens = await listApiTokens(memberId)
  return tokens.find((t) => t.id === id) ?? null
}

/** Live connection status + the current onboarding test mention, if any. No secrets. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    if (!(await ownToken(member.id, id))) return NextResponse.json({ error: await te('토큰을 찾을 수 없어요.') }, { status: 404 })
    const status = await getOnboardingStatus(member.id, id)
    if (!status) return NextResponse.json({ error: await te('토큰을 찾을 수 없어요.') }, { status: 404 })
    return NextResponse.json(status, { headers: NO_STORE })
  } catch (e) {
    return fail(e)
  }
}

/** Start (or reuse) a feed-hidden test mention for this agent. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    const token = await ownToken(member.id, id)
    if (!token) return NextResponse.json({ error: await te('토큰을 찾을 수 없어요.') }, { status: 404 })
    const handle = onboardHandle(token.agentName, token.agentHandle)
    if (!token.agentName) return NextResponse.json({ error: await te('에이전트 이름을 정해주세요.') }, { status: 400 })
    const locale = (await getLocale()) === 'en' ? 'en' : 'ko'
    const status = await startOnboardingTest(member.id, id, {
      handle,
      ownerName: member.display_name || member.handle || '멤버',
      locale,
    })
    return NextResponse.json(status, { headers: NO_STORE })
  } catch (e) {
    return fail(e)
  }
}

/** Soft-delete this agent's onboarding test thread (feed stays clean). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    if (!(await ownToken(member.id, id))) return NextResponse.json({ error: await te('토큰을 찾을 수 없어요.') }, { status: 404 })
    await cleanupOnboardingTest(member.id, id)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (e) {
    return fail(e)
  }
}
