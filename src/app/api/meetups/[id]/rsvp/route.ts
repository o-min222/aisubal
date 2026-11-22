import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { handleMeetupRsvp, sanitizeMeetup } from '@/lib/data/meetups'

interface Params {
  params: Promise<{ id: string }>
}

const applySchema = z.object({
  action: z.enum(['apply', 'cancel', 'approve', 'reject']),
  note: z.string().max(500).optional(),
  posted_as: z.enum(['real', 'nickname']).optional(),
  rsvp_id: z.string().optional(),
})

export async function POST(request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = applySchema.parse(await request.json())
    const result = await handleMeetupRsvp(id, member, body)

    if (result.rsvp && result.meetup) {
      return NextResponse.json({
        rsvp: result.rsvp,
        meetup: sanitizeMeetup(result.meetup, member.id),
      })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'RSVP 처리 실패'
    const status =
      message.includes('호스트만') ? 403 :
      message.includes('찾을 수 없') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
