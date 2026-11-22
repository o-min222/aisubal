import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { adminDeletePost, adminSetPostHidden } from '@/lib/data/admin'
import { z } from 'zod'

interface RouteParams {
  params: Promise<{ id: string }>
}

const hidePostSchema = z.object({
  hidden: z.boolean(),
})

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const data = hidePostSchema.parse(body)
    const post = await adminSetPostHidden(id, data.hidden)
    return NextResponse.json({ success: true, post })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: '게시물 수정 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const { id } = await params

  try {
    const result = await adminDeletePost(id)
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: '게시물 삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
