import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { canMintSessions, createHandoff, HandoffRateLimited } from '@/lib/data/handoff'
import { te } from '@/i18n/server'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** Desktop onboarding: a 10-minute, single-use link that sets up this member's phone (D1). */
export async function POST() {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401, headers: NO_STORE })
  try {
    // oneTap: the phone is signed in straight from the link; otherwise it signs in with Google as the same member
    return NextResponse.json({ ...(await createHandoff(member.id)), oneTap: canMintSessions() }, { headers: NO_STORE })
  } catch (e) {
    if (e instanceof HandoffRateLimited) return NextResponse.json({ error: await te('잠시 후 다시 시도해 주세요.') }, { status: 429, headers: NO_STORE })
    return NextResponse.json({ error: await te('잠시 후 다시 시도해 주세요.') }, { status: 500, headers: NO_STORE })
  }
}
