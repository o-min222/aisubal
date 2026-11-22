import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { announceMoim } from '@/lib/data/moim'
import { moimErrorMessage } from '@/lib/moim-rules'

type Ctx = { params: Promise<{ id: string }> }
const schema = z.object({ body: z.string().trim().min(1).max(1000) })

export async function POST(request: NextRequest, { params }: Ctx) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const { id } = await params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: '공지 내용을 입력해주세요.' }, { status: 400 })
  try {
    await announceMoim(member.id, id, parsed.data.body)
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: moimErrorMessage(e) }, { status: 400 })
  }
}
