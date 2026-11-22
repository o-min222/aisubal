import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { REC_KINDS, setDismissed } from '@/lib/data/rec-dismissals'
import { te } from '@/i18n/server'

const schema = z.object({ kind: z.enum(REC_KINDS), ref: z.string().min(1).max(64), dismissed: z.boolean() })

/** 관심 없음 / 되돌리기 on a recommendation. Members only (session). */
export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: await te('요청 형식이 올바르지 않아요.') }, { status: 400 })
  try {
    await setDismissed(member.id, parsed.data.kind, parsed.data.ref, parsed.data.dismissed)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: await te('잠시 후 다시 시도해 주세요.') }, { status: 500 })
  }
}
