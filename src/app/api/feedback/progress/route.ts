import { NextRequest, NextResponse } from 'next/server'
import { progressBodySchema, verifyProgressSignature } from '@/lib/feedback'
import { FeedbackError, feedbackProgress } from '@/lib/data/feedback'

const H = { 'Cache-Control': 'no-store' }

/**
 * A105: the bot reports progress on an approved item.
 *   POST /api/feedback/progress
 *   X-Feedback-Timestamp: <unix seconds>
 *   X-Feedback-Signature: sha256=<hex HMAC-SHA256(FEEDBACK_PROGRESS_SECRET, `${timestamp}.${rawBody}`)>
 *   { "feedback_id": "<uuid>", "status": "in_progress" | "deployed", "note": "A106 · abc1234" }
 * The DB checks the same secret again (sha256 in feedback_config), so this route holds no extra power.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.FEEDBACK_PROGRESS_SECRET
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503, headers: H })
  const raw = await request.text()
  if (raw.length > 4000) return NextResponse.json({ error: 'too_large' }, { status: 413, headers: H })
  const ok = verifyProgressSignature(secret, request.headers.get('x-feedback-timestamp'), request.headers.get('x-feedback-signature'), raw, Math.floor(Date.now() / 1000))
  if (!ok) return NextResponse.json({ error: 'bad_signature' }, { status: 401, headers: H })
  let body: unknown = null
  try {
    body = JSON.parse(raw)
  } catch {}
  const p = progressBodySchema.safeParse(body)
  if (!p.success) return NextResponse.json({ error: 'bad_body' }, { status: 400, headers: H })
  try {
    const item = await feedbackProgress(secret, p.data.feedback_id, p.data.status, p.data.note ?? null)
    return NextResponse.json({ ok: true, id: item.id, status: item.status }, { headers: H })
  } catch (e) {
    const code = e instanceof FeedbackError ? e.message : 'feedback_failed'
    const status = code === 'feedback_not_found' ? 404 : code === 'feedback_bad_transition' ? 409 : code === 'feedback_forbidden' ? 403 : 500
    return NextResponse.json({ error: code }, { status, headers: H })
  }
}
