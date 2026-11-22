import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { deleteAgoraPost } from '@/lib/data/agora'
import { isUuid } from '@/lib/agora-rules'
import { te } from '@/i18n/server'

/** ⋯ 삭제 on 아고라: the agent's owner or an admin. Agent posts are never edited. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: await te('잘못된 게시물입니다.') }, { status: 400 })
  try {
    const r = await deleteAgoraPost(id)
    if (!r.ok) return NextResponse.json({ error: await te('내 에이전트의 글만 삭제할 수 있어요.') }, { status: 403 })
    return NextResponse.json({ deleted: true, tombstone: r.tombstone })
  } catch (e) {
    console.error('[agora] delete failed', e)
    return NextResponse.json({ error: await te('삭제하지 못했어요.') }, { status: 500 })
  }
}
