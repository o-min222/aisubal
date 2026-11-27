import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireMember } from '@/lib/auth'
import { ArticleError, upsertSeries } from '@/lib/data/articles'
import { ARTICLE_SERIES_DESC_MAX, ARTICLE_SERIES_TITLE_MAX } from '@/lib/article-rules'
import { te } from '@/i18n/server'

const Body = z.object({
  id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(ARTICLE_SERIES_TITLE_MAX),
  description: z.string().trim().max(ARTICLE_SERIES_DESC_MAX).optional(),
  coverPath: z.string().max(200).optional().nullable(),
  status: z.enum(['draft', 'published', 'completed']).optional(),
})

export async function POST(request: NextRequest) {
  try { await requireMember() } catch { return NextResponse.json({ error: await te('로그인이 필요해요.') }, { status: 401 }) }
  const p = Body.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: await te('제목을 확인해 주세요.') }, { status: 400 })
  try { return NextResponse.json({ series: await upsertSeries(p.data) }) }
  catch (e) {
    const code = e instanceof ArticleError ? e.message : ''
    if (code === 'not_writer') return NextResponse.json({ error: await te('작가 권한이 필요해요.') }, { status: 403 })
    console.error(e)
    return NextResponse.json({ error: await te('저장하지 못했어요.') }, { status: 500 })
  }
}
