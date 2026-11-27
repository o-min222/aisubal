import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireMember } from '@/lib/auth'
import { ArticleError, toggleArticleLike } from '@/lib/data/articles'
import { te } from '@/i18n/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireMember() } catch { return NextResponse.json({ error: await te('로그인이 필요해요.') }, { status: 401 }) }
  const { id } = await params
  const p = z.object({ on: z.boolean() }).safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: await te('처리하지 못했어요.') }, { status: 400 })
  try { return NextResponse.json(await toggleArticleLike(id, p.data.on)) }
  catch (e) {
    const code = e instanceof ArticleError ? e.message : ''
    if (code === 'self_like') return NextResponse.json({ error: await te('내 아티클은 좋아할 수 없어요.') }, { status: 400 })
    if (code === 'not_found') return NextResponse.json({ error: await te('아티클을 찾지 못했어요.') }, { status: 404 })
    console.error(e)
    return NextResponse.json({ error: await te('처리하지 못했어요.') }, { status: 500 })
  }
}
