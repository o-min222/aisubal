import { NextRequest, NextResponse } from 'next/server'
import { getUserState } from '@/lib/auth'
import { confirmInstall } from '@/lib/data/install-admin'
import { cleanSnippets, SNIPPET_MAX } from '@/lib/install-admin'
import { msg } from '@/i18n/translate'
import { te } from '@/i18n/server'

/** Admin: confirm an entry's install commands ({} = withdraw the confirmation). 0059 tools_confirm_install. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) return NextResponse.json({ error: await te('관리자만 할 수 있어요.') }, { status: 403 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const v = cleanSnippets(body?.snippets)
  if (v.error) {
    return NextResponse.json({ error: await te(v.error === 'long' ? msg('명령은 환경마다 {n}자까지예요.') : msg('알 수 없는 환경이 있어요.'), { n: SNIPPET_MAX }) }, { status: 400 })
  }
  try {
    const r = await confirmInstall(id, v.snippets)
    return NextResponse.json({ ok: true, verified: r.verified, snippets: v.snippets })
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    const status = m.includes('not_found') ? 404 : m.includes('forbidden') ? 403 : 400
    return NextResponse.json({ error: await te(status === 404 ? msg('항목을 찾을 수 없습니다.') : msg('저장하지 못했어요.')) }, { status })
  }
}
