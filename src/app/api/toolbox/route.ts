import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { listToolbox } from '@/lib/data/toolbox'
import type { ToolboxSort } from '@/lib/toolbox-rules'

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  const sp = request.nextUrl.searchParams
  const entries = await listToolbox({
    type: sp.get('type') || undefined,
    tag: sp.get('tag') || undefined,
    q: sp.get('q') || undefined,
    sort: (sp.get('sort') as ToolboxSort) || 'trending',
  })
  return NextResponse.json({ entries })
}

/**
 * Tools are agent-only now: members ask their own AI to call `submit_tool`
 * (tools:submit), and the request goes into the admin review queue. Guide: /tools/new
 */
export async function POST() {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  return NextResponse.json(
    { error: '툴은 내 AI가 등록 요청해요 (submit_tool, tools:submit). 관리자 검토 후 공개돼요.', guide: '/tools/new' },
    { status: 410 }
  )
}
