import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import {
  createAnnouncement,
  getMeetupAnnouncements,
  getMeetupDetails,
} from '@/lib/data/meetups'

interface Params {
  params: Promise<{ id: string }>
}

const schema = z.object({
  body: z.string().min(1).max(2000),
})

export async function GET(_request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  const announcements = await getMeetupAnnouncements(id)
  return NextResponse.json({ announcements })
}

export async function POST(request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  const meetup = await getMeetupDetails(id)
  if (!meetup) {
    return NextResponse.json({ error: '모임을 찾을 수 없습니다.' }, { status: 404 })
  }

  try {
    const data = schema.parse(await request.json())
    const announcement = await createAnnouncement(id, member.id, data.body)
    return NextResponse.json({ announcement }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : '공지 실패'
    const status = message.includes('호스트만') ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
