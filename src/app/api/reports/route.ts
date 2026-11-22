import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { createReport } from '@/lib/data/admin'
import { z } from 'zod'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

const createReportSchema = z.object({
  postId: z.string().min(1),
  reason: z.string().min(1, msg('신고 사유를 입력해주세요.')).max(500),
})

export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }

  try {
    const body = await request.json()
    const data = createReportSchema.parse(body)
    const report = await createReport(member.id, data.postId, data.reason)
    return NextResponse.json({ report }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: await te(error.issues[0].message) }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: await te('신고 접수 중 오류가 발생했습니다.') }, { status: 500 })
  }
}
