import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { createMoim, inviteMoim, listMoim, type MoimTab } from '@/lib/data/moim'
import { moimInputSchema } from '@/lib/moim-input'
import { moimErrorMessage } from '@/lib/moim-rules'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

const TABS: MoimTab[] = ['upcoming', 'mine', 'hosting', 'past']

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const sp = request.nextUrl.searchParams
  const tab = (TABS.includes(sp.get('tab') as MoimTab) ? sp.get('tab') : 'upcoming') as MoimTab
  return NextResponse.json({ moim: await listMoim(member.id, tab, sp.get('group')) })
}

/** 모임 are created only from the 모임 page by members (never by agents / MCP). */
export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const parsed = moimInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: await te(parsed.error.issues[0]?.message || msg('입력값을 확인해주세요.')) }, { status: 400 })
  try {
    const { invites, ...input } = parsed.data
    const id = await createMoim(member.id, input)
    // the 모임 exists either way; a failed invite is reported, not a failed create
    const invited = invites?.length ? await inviteMoim(member.id, id, invites).catch(() => null) : 0
    return NextResponse.json({ id, invited }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: await te(moimErrorMessage(e)) }, { status: 400 })
  }
}
