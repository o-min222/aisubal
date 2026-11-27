import { NextRequest, NextResponse } from 'next/server'
import { requireMember } from '@/lib/auth'
import { ArticleError, deleteArticle } from '@/lib/data/articles'
import { te } from '@/i18n/server'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireMember() } catch { return NextResponse.json({ error: await te('로그인이 필요해요.') }, { status: 401 }) }
  const { id } = await params
  try { return NextResponse.json(await deleteArticle(id)) }
  catch (e) {
    if (e instanceof ArticleError && e.message === 'not_found') return NextResponse.json({ error: await te('아티클을 찾지 못했어요.') }, { status: 404 })
    console.error(e)
    return NextResponse.json({ error: await te('삭제하지 못했어요.') }, { status: 500 })
  }
}
