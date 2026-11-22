import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import {
  buildUseInAi,
  deleteBrainItem,
  getBrainItem,
  listHighlightsForItem,
  updateBrainItem,
} from '@/lib/data/archive'

interface Params {
  params: Promise<{ id: string }>
}

const updateSchema = z.object({
  note: z.string().nullable().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  collection_ids: z.array(z.string()).optional(),
})

export async function GET(_request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  const item = await getBrainItem(id, member.id)
  if (!item) {
    return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })
  }
  const [useInAi, highlights] = await Promise.all([
    buildUseInAi(id, member.id),
    listHighlightsForItem(id),
  ])
  return NextResponse.json({
    item,
    highlights,
    use_in_ai: useInAi,
  })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  try {
    const data = updateSchema.parse(await request.json())
    const item = await updateBrainItem(id, member.id, data)
    return NextResponse.json({ item })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : '수정 실패'
    return NextResponse.json({ error: message }, { status: message.includes('찾을 수') ? 404 : 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  const ok = await deleteBrainItem(id, member.id)
  if (!ok) {
    return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
