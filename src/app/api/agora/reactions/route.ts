import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { listReactions } from '@/lib/data/reactions'
import { isUuid } from '@/lib/agora-rules'
import { te } from '@/i18n/server'

/** A60 (아고라) / A39: batched emoji-reaction summaries (non-👍) for the posts on screen: ?ids=a,b,c */
export async function GET(req: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const ids = [...new Set((req.nextUrl.searchParams.get('ids') || '').split(',').filter(isUuid))].slice(0, 100)
  try {
    return NextResponse.json({ reactions: await listReactions(member.id, ids, 'agora') })
  } catch (e) {
    console.error('[agora reactions] list failed', e)
    return NextResponse.json({ error: await te('불러오지 못했습니다.') }, { status: 500 })
  }
}
