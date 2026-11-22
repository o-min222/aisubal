import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { searchMembers } from '@/lib/data/social'
import { te } from '@/i18n/server'

/** Name search for pickers (e.g. inviting to a hidden group). Real names only, no emails. */
export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const q = (request.nextUrl.searchParams.get('q') || '').slice(0, 40)
  return NextResponse.json({ members: (await searchMembers(q)).filter((m) => m.id !== member.id) })
}
