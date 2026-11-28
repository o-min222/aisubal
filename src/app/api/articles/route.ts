import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireMember } from '@/lib/auth'
import { ArticleError, upsertArticle } from '@/lib/data/articles'
import { ARTICLE_BODY_MAX, ARTICLE_SUBTITLE_MAX, ARTICLE_TITLE_MAX } from '@/lib/article-rules'
import { te } from '@/i18n/server'

const Body = z.object({
  id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(ARTICLE_TITLE_MAX),
  subtitle: z.string().trim().max(ARTICLE_SUBTITLE_MAX).optional().nullable(),
  body: z.string().max(ARTICLE_BODY_MAX).optional(),
  coverPath: z.string().max(200).optional().nullable(),
  thumbnailPath: z.string().max(200).optional().nullable(),
  seriesId: z.string().uuid().optional().nullable(),
  episodeNo: z.number().int().positive().optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    await requireMember()
  } catch {
    return NextResponse.json({ error: await te('로그인이 필요해요.') }, { status: 401 })
  }
  const p = Body.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: await te('제목을 확인해 주세요.') }, { status: 400 })
  try {
    const article = await upsertArticle(p.data)
    return NextResponse.json({ article })
  } catch (e) {
    const code = e instanceof ArticleError ? e.message : ''
    if (code === 'bad_title') return NextResponse.json({ error: await te('제목을 확인해 주세요.') }, { status: 400 })
    if (code === 'bad_cover' || code === 'bad_thumbnail') return NextResponse.json({ error: await te('이미지를 쓸 수 없어요. 다시 골라 주세요.') }, { status: 400 })
    if (code === 'body_too_long') return NextResponse.json({ error: await te('본문이 너무 길어요.') }, { status: 400 })
    console.error(e)
    return NextResponse.json({ error: await te('저장하지 못했어요.') }, { status: 500 })
  }
}
