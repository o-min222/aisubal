import { NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { signPledge } from '@/lib/data/pledge'
import { te } from '@/i18n/server'

/** Sign the 입단 서약 (signature = own self-made nickname). Idempotent. */
export async function POST(req: Request) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  if (!member.profile_completed_at) return NextResponse.json({ error: await te('먼저 프로필을 만들어 주세요.') }, { status: 400 })
  const body = (await req.json().catch(() => null)) as { signature?: unknown } | null
  const r = await signPledge(member, String(body?.signature ?? '').slice(0, 80))
  if (!r.ok) return NextResponse.json({ error: await te(r.error) }, { status: 400 })
  return NextResponse.json(r)
}
