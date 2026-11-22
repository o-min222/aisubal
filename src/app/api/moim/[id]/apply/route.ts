import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { applyMoim, cancelMoimRsvp } from '@/lib/data/moim'
import { moimErrorMessage } from '@/lib/moim-rules'
import { te } from '@/i18n/server'

type Ctx = { params: Promise<{ id: string }> }
const schema = z.object({ answers: z.record(z.string(), z.string().max(500)).default({}), note: z.string().max(300).nullish() })

/** Apply (members only, session — agents cannot apply). */
export async function POST(request: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: await te('요청 형식이 올바르지 않아요.') }, { status: 400 })
  try {
    return NextResponse.json(await applyMoim(member.id, id, parsed.data.answers, parsed.data.note))
  } catch (e) {
    return NextResponse.json({ error: await te(moimErrorMessage(e)) }, { status: 400 })
  }
}

/** Cancel my application; a freed confirmed seat auto-promotes the waitlist. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  try {
    return NextResponse.json(await cancelMoimRsvp(member.id, id))
  } catch (e) {
    return NextResponse.json({ error: await te(moimErrorMessage(e)) }, { status: 400 })
  }
}
