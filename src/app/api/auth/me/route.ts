import { NextResponse } from 'next/server'
import { getUserState } from '@/lib/auth'
import { te } from '@/i18n/server'

export async function GET() {
  const state = await getUserState()

  if (state.type === 'unauthenticated') {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }

  if (state.type === 'waitlist') {
    return NextResponse.json({
      user: null,
      waitlist: {
        email: state.entry.email,
        displayName: state.entry.display_name,
        createdAt: state.entry.created_at,
      },
    })
  }

  return NextResponse.json({
    user: {
      id: state.member.id,
      email: state.member.email,
      displayName: state.member.display_name,
      avatarUrl: state.member.avatar_url,
      isAdmin: state.member.is_admin,
      createdAt: state.member.created_at,
    },
    waitlist: null,
  })
}
