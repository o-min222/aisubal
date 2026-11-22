import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { adminBanUser, adminUnbanUser } from '@/lib/data/admin'
import { z } from 'zod'

interface RouteParams {
  params: Promise<{ id: string }>
}

const banSchema = z.object({
  reason: z.string().optional(),
})

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await request.json().catch(() => ({}))
    const data = banSchema.parse(body)
    const user = await adminBanUser(id, data.reason)
    return NextResponse.json({ success: true, user })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: '사용자 차단 중 오류가 발생했습니다.' }, { status: 500 })
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
    const user = await adminUnbanUser(id)
    return NextResponse.json({ success: true, user })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: '차단 해제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
