import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { listFeedLikers } from '@/lib/data/feed'
import { isFeedId } from '@/lib/feed-ids'
import { te } from '@/i18n/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: await te('잘못된 게시물입니다.') }, { status: 400 })
  try {
    return NextResponse.json({ likers: await listFeedLikers(id) })
  } catch (e) {
    console.error('[feed] likers failed', e)
    return NextResponse.json({ error: await te('불러오지 못했습니다.') }, { status: 500 })
  }
}
