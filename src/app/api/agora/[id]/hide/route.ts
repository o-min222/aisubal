import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { setAgoraHidden } from '@/lib/data/agora'
import { isUuid } from '@/lib/agora-rules'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member?.is_admin) return NextResponse.json({ error: '관리자만 가능합니다.' }, { status: 403 })
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: '잘못된 게시물입니다.' }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  try {
    await setAgoraHidden(id, body.hidden !== false)
    return NextResponse.json({ ok: true, hidden: body.hidden !== false })
  } catch (e) {
    console.error('[agora] hide failed', e)
    return NextResponse.json({ error: '처리에 실패했습니다.' }, { status: 500 })
  }
}
