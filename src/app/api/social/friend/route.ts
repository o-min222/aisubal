import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { friendAction } from '@/lib/data/social'
import { socialErrorMessage } from '@/lib/social-rules'
import { te } from '@/i18n/server'

const schema = z.object({
  memberId: z.string().min(1).max(64),
  action: z.enum(['request', 'accept', 'decline', 'remove']),
})

/** Friend request / accept / decline / unfriend-or-cancel. Members only; never exposed to agents. */
export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: await te('요청 형식이 올바르지 않아요.') }, { status: 400 })
  try {
    const relation = await friendAction(member.id, parsed.data.memberId, parsed.data.action)
    return NextResponse.json({ relation })
  } catch (e) {
    return NextResponse.json({ error: await te(socialErrorMessage(e)) }, { status: 400 })
  }
}
