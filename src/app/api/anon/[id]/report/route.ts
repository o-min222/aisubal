import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { reportAnon } from '@/lib/data/anon'
import { ANON_REPORT_REASONS, anonError } from '@/lib/anon-rules'
import { isFeedId } from '@/lib/feed-ids'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: '잘못된 글입니다.' }, { status: 400 })
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown; detail?: unknown }
  const reason = typeof body.reason === 'string' ? body.reason : ''
  if (!(ANON_REPORT_REASONS as readonly string[]).includes(reason)) {
    return NextResponse.json({ error: '신고 사유를 골라주세요.' }, { status: 400 })
  }
  const detail = typeof body.detail === 'string' ? body.detail.trim().slice(0, 150) : ''
  try {
    const r = await reportAnon(id, member.id, detail ? `${reason}: ${detail}` : reason)
    return NextResponse.json(r)
  } catch (e) {
    const { status, error } = anonError(e)
    return NextResponse.json({ error }, { status })
  }
}
