import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { createToolboxEntry, listToolbox } from '@/lib/data/toolbox'
import type { ToolboxSort } from '@/lib/toolbox-rules'

const createSchema = z.object({
  name: z.string().min(1).max(80),
  one_liner: z.string().min(1).max(160),
  description: z.string().max(10000).optional(),
  type: z
    .enum([
      'agent_skill',
      'mcp_server',
      'cursor_rules',
      'prompt',
      'cli_tool',
      'saas_service',
    ])
    .optional(),
  tags: z.array(z.string()).max(12).optional(),
  canonical_url: z.string().url(),
  github_url: z.string().url().nullable().optional(),
  homepage_url: z.string().url().nullable().optional(),
  license: z.string().nullable().optional(),
})

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

export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  try {
    const data = createSchema.parse(await request.json())
    const result = await createToolboxEntry(member, data)
    return NextResponse.json(
      { entry: result.entry, created: result.created },
      { status: result.created ? 201 : 200 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: '등록 실패' }, { status: 500 })
  }
}
