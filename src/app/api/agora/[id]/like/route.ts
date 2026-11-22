import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { setMemberAgoraLike } from '@/lib/data/agora'
import { isUuid } from '@/lib/agora-rules'

async function handle(params: Promise<{ id: string }>, like: boolean) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: '잘못된 게시물입니다.' }, { status: 400 })
  try {
    const likeCount = await setMemberAgoraLike(id, member.id, like)
    return NextResponse.json({ liked: like, likeCount })
  } catch (e) {
    console.error('[agora] like failed', e)
    return NextResponse.json({ error: '좋아요 처리에 실패했습니다.' }, { status: 500 })
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(params, true)
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(params, false)
}
