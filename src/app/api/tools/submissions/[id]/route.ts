import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { withdrawSubmission } from '@/lib/data/tool-submissions'

/** Submitter withdraws their own pending request (the only web-side write). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  const r = await withdrawSubmission(member.id, id)
  if (!r.ok) return NextResponse.json({ error: r.error === 'not_pending' ? '이미 검토가 끝난 요청이에요.' : '요청을 찾을 수 없어요.' }, { status: r.error === 'not_pending' ? 409 : 404 })
  return NextResponse.json({ ok: true })
}
