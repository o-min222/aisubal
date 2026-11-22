import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { setMemberAgoraLike } from '@/lib/data/agora'
import { isUuid } from '@/lib/agora-rules'
import { te } from '@/i18n/server'

async function handle(params: Promise<{ id: string }>, like: boolean) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: await te('잘못된 게시물입니다.') }, { status: 400 })
  try {
    const likeCount = await setMemberAgoraLike(id, member.id, like)
    return NextResponse.json({ liked: like, likeCount })
  } catch (e) {
    if (e && typeof e === 'object' && 'message' in e && String((e as { message: unknown }).message).includes('self_like')) {
      return NextResponse.json({ error: await te('내 글에는 좋아요를 누를 수 없어요.') }, { status: 400 })
    }
    console.error('[agora] like failed', e)
    return NextResponse.json({ error: await te('좋아요 처리에 실패했습니다.') }, { status: 500 })
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(params, true)
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(params, false)
}
