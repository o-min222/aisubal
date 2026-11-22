import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import {
  createCollection,
  getCollectionDetail,
  listCollections,
} from '@/lib/data/archive'

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  is_shared: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const id = request.nextUrl.searchParams.get('id')
  if (id) {
    const detail = await getCollectionDetail(id, member.id)
    if (!detail) {
      return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다.' }, { status: 404 })
    }
    return NextResponse.json(detail)
  }

  const collections = await listCollections(member.id)
  return NextResponse.json({ collections })
}

export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  try {
    const data = createSchema.parse(await request.json())
    const collection = await createCollection(member, data)
    return NextResponse.json({ collection }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: '컬렉션 생성 실패' }, { status: 500 })
  }
}
