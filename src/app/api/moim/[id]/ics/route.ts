import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { moimForIcs } from '@/lib/data/moim-calendar'
import { buildIcs, icsFilename } from '@/lib/moim-calendar'
import { getLocale, te } from '@/i18n/server'

type Ctx = { params: Promise<{ id: string }> }

/** A53: one 모임 as an .ics file (session; the exact place only if the web shows it to this member). */
export async function GET(request: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const m = await moimForIcs(member.id, id).catch(() => null)
  if (!m) return NextResponse.json({ error: await te('모임을 찾을 수 없어요.') }, { status: 404 })
  const lang = (await getLocale()) === 'en' ? 'en' : 'ko'
  const body = buildIcs([m], { origin: request.nextUrl.origin, lang })
  return new NextResponse(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="moim.ics"; filename*=UTF-8''${encodeURIComponent(icsFilename(m.title))}`,
      'cache-control': 'private, no-store',
    },
  })
}
