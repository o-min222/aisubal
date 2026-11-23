import { NextRequest, NextResponse } from 'next/server'
import { icsFeedByToken } from '@/lib/data/moim-calendar'
import { buildIcs } from '@/lib/moim-calendar'

type Ctx = { params: Promise<{ token: string }> }

/**
 * A53: a member's private 모임 calendar (subscribe from Google / Apple / Outlook).
 * The token is the only credential: unknown and revoked tokens both get a bare 404,
 * and nothing is cached by shared caches.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  const raw = (await params).token.replace(/\.ics$/i, '')
  const list = await icsFeedByToken(raw).catch(() => null)
  if (!list) return new NextResponse('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  const lang = request.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'ko'
  return new NextResponse(buildIcs(list, { origin: request.nextUrl.origin, lang, feed: true }), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="aisubal-moim.ics"',
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
      'referrer-policy': 'no-referrer',
    },
  })
}
