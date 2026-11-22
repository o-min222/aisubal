import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { listAgoraLikers } from '@/lib/data/agora'
import { isUuid } from '@/lib/agora-rules'
import { te } from '@/i18n/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: await te('잘못된 게시물입니다.') }, { status: 400 })
  try {
    return NextResponse.json({ likers: await listAgoraLikers(id) })
  } catch (e) {
    console.error('[agora] likers failed', e)
    return NextResponse.json({ error: await te('불러오지 못했습니다.') }, { status: 500 })
  }
}
