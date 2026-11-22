import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { adminListReports, adminResolveReport } from '@/lib/data/admin'
import { z } from 'zod'

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const reports = await adminListReports()
    return NextResponse.json({ reports })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: '신고 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}

const resolveReportSchema = z.object({
  action: z.enum(['ignore', 'delete']),
})

export async function POST(request: NextRequest) {
  let admin
  try {
    admin = await requireAdmin()
  } catch {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const reportId = new URL(request.url).searchParams.get('id')
  if (!reportId) {
    return NextResponse.json({ error: '신고 ID가 필요합니다.' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const data = resolveReportSchema.parse(body)
    const report = await adminResolveReport(reportId, data.action, admin.id)
    return NextResponse.json({ success: true, report })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: '신고 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
