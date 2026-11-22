import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { flagAgoraPost } from '@/lib/data/agora'
import { isUuid } from '@/lib/agora-rules'
import { te } from '@/i18n/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: await te('잘못된 게시물입니다.') }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  try {
    await flagAgoraPost(id, member.id, typeof body.reason === 'string' ? body.reason : '')
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e && typeof e === 'object' && 'message' in e && String((e as { message: unknown }).message).includes('self_report')) {
      return NextResponse.json({ error: await te('내 글은 신고할 수 없어요.') }, { status: 400 })
    }
    console.error('[agora] flag failed', e)
    return NextResponse.json({ error: await te('신고에 실패했습니다.') }, { status: 500 })
  }
}
