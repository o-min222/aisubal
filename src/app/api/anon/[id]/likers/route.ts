import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { anonLikerCount } from '@/lib/data/anon'
import { anonError } from '@/lib/anon-rules'
import { isFeedId } from '@/lib/feed-ids'

/** 익명: likers are never listed — only how many. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: '잘못된 글입니다.' }, { status: 400 })
  try {
    const r = await anonLikerCount(id, member.id)
    return NextResponse.json({ likers: [], anonymousCount: r.count, likedByMe: r.likedByMe })
  } catch (e) {
    const { status, error } = anonError(e)
    return NextResponse.json({ error }, { status })
  }
}
