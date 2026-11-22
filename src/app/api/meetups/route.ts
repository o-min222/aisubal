import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import {
  createMeetup,
  listMeetupsDetailed,
  sanitizeMeetup,
} from '@/lib/data/meetups'

const createSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(10000),
  mode: z.enum(['offline', 'online']),
  venue_name: z.string().nullable().optional(),
  venue_address: z.string().nullable().optional(),
  map_url: z.string().url().nullable().optional(),
  meeting_url: z.string().url().nullable().optional(),
  starts_at: z.string().min(1),
  ends_at: z.string().nullable().optional(),
  capacity: z.number().int().positive().max(500),
  apply_deadline: z.string().nullable().optional(),
  requires_approval: z.boolean().optional(),
  fee_note: z.string().nullable().optional(),
  posted_as: z.enum(['real', 'nickname']).optional(),
})

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const tab = request.nextUrl.searchParams.get('tab') || 'upcoming'
  const meetups = await listMeetupsDetailed()
  const filtered =
    tab === 'past'
      ? meetups.filter((m) => m.status === 'past' || m.status === 'cancelled')
      : meetups.filter((m) => m.status === 'open' || m.status === 'closed')

  const safe = filtered.map((m) => sanitizeMeetup(m, member.id))
  return NextResponse.json({ meetups: safe })
}

export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    if (data.mode === 'offline' && !data.venue_name) {
      return NextResponse.json({ error: '오프라인 모임은 장소명이 필요합니다.' }, { status: 400 })
    }
    if (data.mode === 'online' && !data.meeting_url) {
      return NextResponse.json({ error: '온라인 모임은 미팅 링크가 필요합니다.' }, { status: 400 })
    }

    const meetup = await createMeetup(member, data)
    return NextResponse.json({ meetup }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: '모임 생성 실패' }, { status: 500 })
  }
}

export { sanitizeMeetup }
