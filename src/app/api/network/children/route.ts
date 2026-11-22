import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { getInviteChildren, GRAPH_PER_NODE } from '@/lib/data/graph'

/** Lazy expansion: one page of a node's invitees (never the full tree). */
export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const sp = request.nextUrl.searchParams
  const id = sp.get('member')
  if (!id) return NextResponse.json({ error: 'member가 필요해요.' }, { status: 400 })
  try {
    return NextResponse.json(await getInviteChildren(member.id, id, Math.max(0, Number(sp.get('offset')) || 0), GRAPH_PER_NODE))
  } catch (e) {
    console.error('[network] children failed', e)
    return NextResponse.json({ error: '불러오지 못했어요.' }, { status: 400 })
  }
}
