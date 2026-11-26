import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { FeedbackError, adminGetFeedback, adminReviewFeedback, adminSetFeedbackStatus } from '@/lib/data/feedback'
import { sendDevRequest } from '@/lib/feedback-server'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

export const maxDuration = 30
const H = { 'Cache-Control': 'no-store' }
const schema = z.object({
  action: z.enum(['approve', 'reject', 'in_progress', 'deployed', 'resend']),
  note: z.string().max(1000).optional().nullable(),
})

/** A105 inbox actions. approve → status first, then the dev-request webhook (its outcome is saved on the item). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: await te('권한이 없습니다.') }, { status: 403, headers: H })
  }
  const { id } = await params
  const p = schema.safeParse(await request.json().catch(() => null))
  if (!p.success || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: await te(msg('처리하지 못했어요.')) }, { status: 400, headers: H })
  const note = p.data.note?.trim() || null
  try {
    if (p.data.action === 'approve' || p.data.action === 'resend') {
      const item = p.data.action === 'approve' ? await adminReviewFeedback(id, 'approve', note) : await adminGetFeedback(id)
      if (!item || item.status === 'pending' || item.status === 'rejected') throw new FeedbackError('feedback_bad_transition')
      const webhook = await sendDevRequest(item)
      return NextResponse.json({ item: await adminGetFeedback(id), webhook }, { headers: H })
    }
    if (p.data.action === 'reject') await adminReviewFeedback(id, 'reject', note)
    else await adminSetFeedbackStatus(id, p.data.action, note)
    return NextResponse.json({ item: await adminGetFeedback(id) }, { headers: H })
  } catch (e) {
    const code = e instanceof FeedbackError ? e.message : ''
    if (!code) console.error('[admin/feedback] action failed', e)
    return NextResponse.json(
      { error: await te(code === 'feedback_bad_transition' ? msg('지금 상태에서는 할 수 없는 처리예요.') : code === 'feedback_not_found' ? msg('피드백을 찾을 수 없어요.') : msg('처리하지 못했어요.')) },
      { status: code === 'feedback_not_found' ? 404 : code === 'feedback_bad_transition' ? 409 : 500, headers: H }
    )
  }
}
