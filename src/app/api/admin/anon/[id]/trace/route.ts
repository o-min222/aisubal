import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { adminTraceAnon } from '@/lib/data/anon'
import { anonError } from '@/lib/anon-rules'
import { isFeedId } from '@/lib/feed-ids'

/** Admin-only author lookup. Requires a reason; the database logs every lookup. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member?.is_admin) return NextResponse.json({ error: '운영자만 할 수 있어요.' }, { status: 403 })
  const { id } = await params
  if (!isFeedId(id)) return NextResponse.json({ error: '잘못된 글입니다.' }, { status: 400 })
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 4) return NextResponse.json({ error: '조회 사유를 4자 이상 적어주세요.' }, { status: 400 })
  try {
    return NextResponse.json(await adminTraceAnon(id, reason.slice(0, 500)))
  } catch (e) {
    const { status, error } = anonError(e)
    return NextResponse.json({ error }, { status })
  }
}
