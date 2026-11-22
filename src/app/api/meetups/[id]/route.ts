import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import {
  cancelMeetup,
  getMeetupDetails,
  sanitizeMeetup,
  updateMeetupRecap,
} from '@/lib/data/meetups'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  const meetup = await getMeetupDetails(id)
  if (!meetup) {
    return NextResponse.json({ error: '모임을 찾을 수 없습니다.' }, { status: 404 })
  }
  return NextResponse.json({ meetup: sanitizeMeetup(meetup, member.id) })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  const meetup = await getMeetupDetails(id)
  if (!meetup) {
    return NextResponse.json({ error: '모임을 찾을 수 없습니다.' }, { status: 404 })
  }
  if (meetup.host_id !== member.id) {
    return NextResponse.json({ error: '호스트만 수정할 수 있습니다.' }, { status: 403 })
  }

  const body = await request.json()
  if (body.action === 'cancel') {
    await cancelMeetup(id, member.id)
    const updated = await getMeetupDetails(id)
    return NextResponse.json({ meetup: updated })
  }
  if (body.action === 'recap') {
    const updated = await updateMeetupRecap(id, member.id, {
      recap_post_id: body.recap_post_id,
      recap_photos: body.recap_photos,
    })
    return NextResponse.json({ meetup: updated })
  }
  return NextResponse.json({ error: '알 수 없는 액션' }, { status: 400 })
}
