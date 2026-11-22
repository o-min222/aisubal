import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { createAnon, listAnon } from '@/lib/data/anon'
import { anonError, isAnonCategory, parseSort, validateAnonInput } from '@/lib/anon-rules'
import { isFeedId } from '@/lib/feed-ids'
import { te } from '@/i18n/server'

// 익명 board: session members only. Never exposed via MCP/CLI tokens.
// Responses carry per-thread aliases, never member ids.

export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const sp = request.nextUrl.searchParams
  const category = sp.get('category')
  try {
    const posts = await listAnon(member.id, {
      category: isAnonCategory(category) ? category : null,
      sort: parseSort(sp.get('sort')),
      before: sp.get('before') || undefined,
      offset: Number(sp.get('offset') || 0) || 0,
      limit: 30,
    })
    return NextResponse.json({ posts })
  } catch (e) {
    const { status, error } = anonError(e)
    if (status === 500) console.error('[anon] list failed', e)
    return NextResponse.json({ error }, { status })
  }
}

export async function POST(request: NextRequest) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  const raw = await request.json().catch(() => null)
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: await te('요청 형식이 올바르지 않아요.') }, { status: 400 })
  const v = validateAnonInput(raw as Record<string, unknown>)
  if (!v.ok) return NextResponse.json({ error: await te(v.error) }, { status: 400 })
  if (v.value.parentId && !isFeedId(v.value.parentId)) {
    return NextResponse.json({ error: await te('잘못된 글입니다.') }, { status: 400 })
  }
  try {
    const r = await createAnon(member.id, v.value)
    return NextResponse.json({ id: r.id, rootId: r.rootId, alias: r.alias })
  } catch (e) {
    const { status, error } = anonError(e)
    if (status === 500) console.error('[anon] create failed', e)
    return NextResponse.json({ error }, { status })
  }
}
