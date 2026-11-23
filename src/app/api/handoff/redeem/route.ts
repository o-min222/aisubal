import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { canMintSessions, mintHandoffSession, redeemHandoff, type RedeemResult } from '@/lib/data/handoff'
import { isHandoffToken } from '@/lib/handoff-rules'

/**
 * The phone opened /h#<token>. The token only ever arrives in this POST body (never a URL), and is
 * never logged. Signed in → completes for the same member only; signed out → one-tap sign-in when
 * the server can mint sessions, else the page asks for a normal sign-in and comes back.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null
  const token = body?.token
  let result: RedeemResult
  if (!isHandoffToken(token)) result = 'invalid'
  else {
    const member = await getMember()
    result = member ? await redeemHandoff(member.id, token) : canMintSessions() ? await mintHandoffSession(token) : 'needs_login'
  }
  return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store' } })
}
