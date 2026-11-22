import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { listMyInviteCodes } from '@/lib/data/invites'
import { te } from '@/i18n/server'

export async function GET() {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }

  try {
    const result = await listMyInviteCodes(member.id, !!member.signup_completed_at)
    return NextResponse.json(result)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: await te('초대 코드를 불러오지 못했습니다.') }, { status: 500 })
  }
}
