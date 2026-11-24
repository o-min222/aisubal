import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { setMemberRepost } from '@/lib/data/feed'
import { isFeedId } from '@/lib/feed-ids'
import { te } from '@/i18n/server'

/** A95 (0128): repost / undo. The DB guard refuses anything restricted, a comment, a group or 부캐 post, or your own. */
async function handle(params: Promise<{ id: string }>, on: boolean) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: await te('잘못된 게시물입니다.') }, { status: 400 })
  try {
    const repostCount = await setMemberRepost(id, member.id, on)
    return NextResponse.json({ reposted: on, repostCount })
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message
    if (msg === 'repost_not_allowed') return NextResponse.json({ error: await te('이 글은 리포스트할 수 없어요.') }, { status: 403 })
    if (msg === 'not_found') return NextResponse.json({ error: await te('잘못된 게시물입니다.') }, { status: 404 })
    console.error('[feed] repost failed', e)
    return NextResponse.json({ error: await te('리포스트 처리에 실패했습니다.') }, { status: 500 })
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(params, true)
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(params, false)
}
