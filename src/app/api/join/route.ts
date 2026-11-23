import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { joinWaitlist, waitlistCount, JoinError } from '@/lib/data/public-waitlist'
import { JOIN_REASON_MAX, joinEmailError, joinSource } from '@/lib/join-rules'
import { getLocale, te } from '@/i18n/server'

const schema = z.object({
  email: z.string().max(320),
  reason: z.string().max(2000).nullish(),
  source: z.string().max(64).nullish(),
  website: z.string().max(200).nullish(), // honeypot: people never fill it
})

/** a coarse per-client key for the rate limit; the raw IP is never stored */
function clientKey(req: NextRequest): string | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip')
  return ip ? createHash('sha256').update(`aisubal-join:${ip}`).digest('hex').slice(0, 32) : null
}

/** A57: live count for /join */
export async function GET() {
  const waiting = await waitlistCount().catch(() => null)
  return NextResponse.json({ waiting }, { headers: { 'cache-control': 'no-store' } })
}

/** A57: public sign-up. The answer is the same whether or not the email was already on the list. */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: await te('요청 형식이 올바르지 않아요.') }, { status: 400 })
  const { email, reason, source, website } = parsed.data
  if (website) return NextResponse.json({ ok: true, waiting: await waitlistCount().catch(() => null) }, { status: 201 })
  const bad = joinEmailError(email)
  if (bad) return NextResponse.json({ error: await te(bad) }, { status: 400 })
  if (reason && reason.trim().length > JOIN_REASON_MAX) return NextResponse.json({ error: await te('300자까지 쓸 수 있어요.') }, { status: 400 })
  try {
    const r = await joinWaitlist({ email, reason: reason ?? null, source: joinSource(source), locale: await getLocale(), client: clientKey(req) })
    return NextResponse.json({ ok: true, waiting: r.waiting }, { status: 201 })
  } catch (e) {
    const m = e instanceof JoinError ? e.message : ''
    if (m.includes('waitlist_rate')) return NextResponse.json({ error: await te('잠시 후 다시 시도해 주세요.') }, { status: 429 })
    if (m.includes('waitlist_bad_email')) return NextResponse.json({ error: await te('이메일 주소를 확인해 주세요.') }, { status: 400 })
    console.error('[join] failed', e)
    return NextResponse.json({ error: await te('처리에 실패했어요.') }, { status: 500 })
  }
}
