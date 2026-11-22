import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { flagAgoraPost } from '@/lib/data/agora'
import { isUuid } from '@/lib/agora-rules'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: '잘못된 게시물입니다.' }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  try {
    await flagAgoraPost(id, member.id, typeof body.reason === 'string' ? body.reason : '')
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[agora] flag failed', e)
    return NextResponse.json({ error: '신고에 실패했습니다.' }, { status: 500 })
  }
}
