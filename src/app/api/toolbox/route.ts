import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { listToolbox } from '@/lib/data/toolbox'
import type { ToolboxSort } from '@/lib/toolbox-rules'
import { te } from '@/i18n/server'

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
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
 * (tools:submit), and the request goes into the admin review queue. Guide: /gallery/new
 */
export async function POST() {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }
  return NextResponse.json(
    { error: await te('갤러리 항목은 내 AI가 올려요 (submit_tool, tools:submit). 올리면 바로 공개돼요.'), guide: '/gallery/new' },
    { status: 410 }
  )
}
