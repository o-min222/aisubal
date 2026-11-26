import { NextRequest, NextResponse } from 'next/server'
import { canGiveFeedback, getUserState } from '@/lib/auth'
import { feedbackMetaSchema } from '@/lib/feedback'
import { FeedbackError, submitFeedback, toShotWebp } from '@/lib/data/feedback'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

export const maxDuration = 30
const H = { 'Cache-Control': 'no-store' }

/** A105: one 화면 피드백 — multipart `meta` (JSON) + optional `shot` (the viewport image with the box drawn on it). */
export async function POST(request: NextRequest) {
  const state = await getUserState()
  if (state.type !== 'member') return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401, headers: H })
  const me = state.member
  if (!canGiveFeedback(me)) {
    return NextResponse.json({ error: await te(msg('피드백 모드를 쓸 수 없는 계정이에요.')) }, { status: 403, headers: H })
  }
  const form = await request.formData().catch(() => null)
  let meta: unknown = null
  try {
    meta = JSON.parse(String(form?.get('meta') ?? ''))
  } catch {}
  const parsed = feedbackMetaSchema.safeParse(meta)
  if (!parsed.success) return NextResponse.json({ error: await te(msg('내용을 적어 주세요.')) }, { status: 400, headers: H })
  const file = form?.get('shot')
  let shot: Buffer | null = null
  if (file instanceof File && file.size > 0) shot = await toShotWebp(file).catch(() => null)
  try {
    const id = await submitFeedback(me.auth_id, me, parsed.data, shot, request.headers.get('user-agent')?.slice(0, 400) ?? null)
    return NextResponse.json({ id, shot: Boolean(shot) }, { headers: H })
  } catch (e) {
    const code = e instanceof FeedbackError ? e.message : ''
    if (!code) console.error('[feedback] submit failed', e)
    const m =
      code === 'feedback_rate_limited' ? msg('피드백을 너무 많이 보냈어요. 잠시 뒤에 다시 보내 주세요.')
      : code === 'feedback_not_allowed' ? msg('피드백 모드를 쓸 수 없는 계정이에요.')
      : code === 'feedback_empty' ? msg('내용을 적어 주세요.')
      : msg('피드백을 보내지 못했어요.')
    return NextResponse.json({ error: await te(m) }, { status: code === 'feedback_not_allowed' ? 403 : code === 'feedback_rate_limited' ? 429 : 400, headers: H })
  }
}
