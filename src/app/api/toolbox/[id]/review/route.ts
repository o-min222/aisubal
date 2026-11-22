import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { upsertToolboxReview } from '@/lib/data/toolbox'
import { te } from '@/i18n/server'

interface Params {
  params: Promise<{ id: string }>
}

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().max(500).optional(),
})

export async function POST(request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }
  const { id } = await params
  try {
    const data = schema.parse(await request.json())
    const entry = await upsertToolboxReview(id, member.id, data.rating, data.body || '')
    return NextResponse.json({ entry })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: await te(error.issues[0].message) }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : '리뷰 실패'
    return NextResponse.json({ error: await te(message) }, { status: message.includes('찾을 수') ? 404 : 500 })
  }
}
