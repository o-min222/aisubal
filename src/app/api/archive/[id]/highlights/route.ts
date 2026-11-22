import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { addHighlight } from '@/lib/data/archive'
import { te } from '@/i18n/server'

interface Params {
  params: Promise<{ id: string }>
}

const schema = z.object({
  quote: z.string().min(1).max(2000),
  note: z.string().max(500).nullable().optional(),
})

export async function POST(request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }
  const { id } = await params
  try {
    const data = schema.parse(await request.json())
    const highlight = await addHighlight(id, member, data.quote, data.note)
    return NextResponse.json({ highlight }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: await te(error.issues[0].message) }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : '하이라이트 실패'
    return NextResponse.json({ error: await te(message) }, { status: message.includes('찾을 수') ? 404 : 500 })
  }
}
