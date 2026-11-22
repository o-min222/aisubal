import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { getMoim, setMoimStatus, updateMoim } from '@/lib/data/moim'
import { moimInputSchema } from '@/lib/moim-input'
import { moimErrorMessage } from '@/lib/moim-rules'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const m = await getMoim(member.id, id)
  if (!m) return NextResponse.json({ error: await te('모임을 찾을 수 없어요.') }, { status: 404 })
  return NextResponse.json({ moim: m })
}

const statusSchema = z.object({ status: z.enum(['open', 'closed', 'cancelled']) })

/** Managers: full update, or { status } to close / reopen / cancel. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => null)
  try {
    const st = statusSchema.safeParse(body)
    if (st.success) {
      await setMoimStatus(member.id, id, st.data.status)
      return NextResponse.json({ ok: true })
    }
    const parsed = moimInputSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: await te(parsed.error.issues[0]?.message || msg('입력값을 확인해주세요.')) }, { status: 400 })
    await updateMoim(member.id, id, parsed.data)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: await te(moimErrorMessage(e)) }, { status: 400 })
  }
}
