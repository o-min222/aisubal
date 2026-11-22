import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { decideMoimRsvp } from '@/lib/data/moim'
import { moimErrorMessage } from '@/lib/moim-rules'
import { te } from '@/i18n/server'

type Ctx = { params: Promise<{ id: string }> }
const schema = z.object({ rsvpId: z.string().min(1).max(64), action: z.enum(['approve', 'waitlist', 'reject', 'remove']) })

/** Host / group managers: approve, waitlist, reject or remove an attendee. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: await te('요청 형식이 올바르지 않아요.') }, { status: 400 })
  try {
    return NextResponse.json(await decideMoimRsvp(member.id, id, parsed.data.rsvpId, parsed.data.action))
  } catch (e) {
    return NextResponse.json({ error: await te(moimErrorMessage(e)) }, { status: 400 })
  }
}
