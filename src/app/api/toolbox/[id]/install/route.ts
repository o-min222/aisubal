import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMember } from '@/lib/auth'
import { getToolboxEntry, recordToolboxInstall } from '@/lib/data/toolbox'
import { TOOLBOX_ENV_LABEL } from '@/lib/toolbox-rules'
import type { ToolboxEnvironment } from '@/lib/supabase/types'
import { te } from '@/i18n/server'

interface Params {
  params: Promise<{ id: string }>
}

const schema = z.object({
  environment: z
    .enum([
      'claude_code',
      'claude_desktop',
      'cursor',
      'codex_cli',
      'chatgpt',
      'gemini_cli',
      'generic',
    ])
    .optional(),
})

export async function GET(request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }
  const { id } = await params
  const entry = await getToolboxEntry(id)
  if (!entry) {
    return NextResponse.json({ error: await te('항목을 찾을 수 없습니다.') }, { status: 404 })
  }
  const env = (request.nextUrl.searchParams.get('environment') ||
    'cursor') as ToolboxEnvironment | 'generic'
  const snippet =
    entry.install_snippets[env] ||
    entry.install_snippets.generic ||
    entry.install_snippets.cursor ||
    `# ${entry.name}\n# ${entry.canonical_url}`

  return NextResponse.json({
    entry_id: entry.id,
    name: entry.name,
    environment: env,
    environment_label:
      env === 'generic' ? 'Generic' : TOOLBOX_ENV_LABEL[env as ToolboxEnvironment],
    snippet,
    cursor_deeplink:
      entry.type === 'mcp_server'
        ? `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(entry.name)}&config=${encodeURIComponent(Buffer.from(snippet).toString('base64'))}`
        : null,
    security: {
      source_repo: entry.source_repo,
      license: entry.license,
      last_commit_at: entry.last_commit_at,
      github_url: entry.github_url,
      note: '설치 전 소스·라이선스·최근 커밋을 확인하세요.',
    },
  })
}

export async function POST(request: NextRequest, { params }: Params) {
  const member = await getMember()
  if (!member) {
    return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  }
  const { id } = await params
  try {
    schema.parse(await request.json().catch(() => ({})))
  } catch {
    /* optional body */
  }
  try {
    const entry = await recordToolboxInstall(id)
    return NextResponse.json({
      ok: true,
      install_count: entry.install_count,
      entry,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '설치 기록 실패'
    return NextResponse.json({ error: await te(message) }, { status: 404 })
  }
}
