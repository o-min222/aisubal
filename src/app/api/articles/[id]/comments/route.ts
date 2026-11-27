import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireMember } from '@/lib/auth'
import { ArticleError, addArticleComment } from '@/lib/data/articles'
import { ARTICLE_COMMENT_MAX } from '@/lib/article-rules'
import { te } from '@/i18n/server'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireMember() } catch { return NextResponse.json({ error: await te('로그인이 필요해요.') }, { status: 401 }) }
  const { id } = await params
  const p = z.object({
    body: z.string().trim().min(1).max(ARTICLE_COMMENT_MAX),
    parentId: z.string().uuid().optional().nullable(),
    replyToId: z.string().uuid().optional().nullable(),
  }).safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: await te('댓글을 확인해 주세요.') }, { status: 400 })
  try { return NextResponse.json({ comment: await addArticleComment(id, p.data.body, p.data.parentId, p.data.replyToId) }) }
  catch (e) {
    const code = e instanceof ArticleError ? e.message : ''
    if (code === 'comment_rate_limited') return NextResponse.json({ error: await te('댓글을 너무 자주 달았어요. 잠시 후 다시 시도해 주세요.') }, { status: 429 })
    console.error(e)
    return NextResponse.json({ error: await te('댓글을 남기지 못했어요.') }, { status: 500 })
  }
}
