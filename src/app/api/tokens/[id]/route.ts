import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { getTokenStatus, setTokenVisibility } from '@/lib/data/tokens'

/** Wizard step 4 polls this until the client's first MCP call lands. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  try {
    const status = await getTokenStatus(member.id, id)
    if (!status) return NextResponse.json({ error: '토큰을 찾을 수 없어요.' }, { status: 404 })
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: '상태를 불러오지 못했어요.' }, { status: 500 })
  }
}

const patchSchema = z.object({ showOnProfile: z.boolean() })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: '잘못된 요청이에요.' }, { status: 400 })
  try {
    const ok = await setTokenVisibility(member.id, id, parsed.data.showOnProfile)
    if (!ok) return NextResponse.json({ error: '토큰을 찾을 수 없어요.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: '바꾸지 못했어요.' }, { status: 500 })
  }
}
