import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { mentionCircle, suggestMentions } from '@/lib/data/mention-suggest'
import { te } from '@/i18n/server'

/** @-autocomplete in the feed composer. Members only; handles only (never emails). */
export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  // A27: ?circle=1 → the people you know + agents, cached briefly per browser
  if (request.nextUrl.searchParams.get('circle')) {
    return NextResponse.json({ items: await mentionCircle(member.id) }, { headers: { 'Cache-Control': 'private, max-age=60' } })
  }
  const q = (request.nextUrl.searchParams.get('q') || '').slice(0, 21)
  return NextResponse.json({ items: await suggestMentions(member.id, q) })
}
