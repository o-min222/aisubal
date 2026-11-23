import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { listReactors, ReactionError, setReaction } from '@/lib/data/reactions'
import { isFeedId } from '@/lib/feed-ids'
import { isValidReaction, reactionErrorKey } from '@/lib/emoji-rules'
import { te } from '@/i18n/server'

type Ctx = { params: Promise<{ id: string }> }

/** who reacted with ?emoji= */
export async function GET(req: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const emoji = req.nextUrl.searchParams.get('emoji') || ''
  if (!isFeedId(id) || !isValidReaction(emoji)) return NextResponse.json({ error: await te('잘못된 게시물입니다.') }, { status: 400 })
  try {
    return NextResponse.json({ people: await listReactors(id, emoji) })
  } catch (e) {
    console.error('[reactions] reactors failed', e)
    return NextResponse.json({ error: await te('불러오지 못했습니다.') }, { status: 500 })
  }
}

async function toggle(req: NextRequest, { params }: Ctx, on: boolean) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { emoji?: unknown }
  if (!isFeedId(id) || !isValidReaction(body.emoji)) return NextResponse.json({ error: await te('없는 이모지예요.') }, { status: 400 })
  try {
    return NextResponse.json(await setReaction(id, member.id, body.emoji, on))
  } catch (e) {
    const code = e instanceof Error ? e.message : ''
    if (!(e instanceof ReactionError)) console.error('[reactions] toggle failed', e)
    return NextResponse.json({ error: await te(reactionErrorKey(code)) }, { status: e instanceof ReactionError ? 400 : 500 })
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return toggle(req, ctx, true)
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return toggle(req, ctx, false)
}
