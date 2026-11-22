import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { getInviteGraph } from '@/lib/data/graph'

/** Invite graph around a member: up to 3 hops, capped children per node (members only). */
export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  try {
    return NextResponse.json(await getInviteGraph(member.id, request.nextUrl.searchParams.get('root')))
  } catch (e) {
    console.error('[network] graph failed', e)
    return NextResponse.json({ error: '네트워크를 불러오지 못했어요.' }, { status: 400 })
  }
}
