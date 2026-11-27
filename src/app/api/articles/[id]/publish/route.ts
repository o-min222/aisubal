import { NextRequest, NextResponse } from 'next/server'
import { requireMember } from '@/lib/auth'
import { ArticleError, publishArticle } from '@/lib/data/articles'
import { te } from '@/i18n/server'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMember()
  } catch {
    return NextResponse.json({ error: await te('로그인이 필요해요.') }, { status: 401 })
  }
  const { id } = await params
  try {
    return NextResponse.json({ article: await publishArticle(id) })
  } catch (e) {
    const code = e instanceof ArticleError ? e.message : ''
    if (code === 'not_writer') return NextResponse.json({ error: await te('작가 권한이 필요해요.') }, { status: 403 })
    if (code === 'publish_rate_limited') return NextResponse.json({ error: await te('하루에 발행할 수 있는 아티클 수를 넘겼어요.') }, { status: 429 })
    if (code === 'empty_article') return NextResponse.json({ error: await te('제목과 본문을 채워 주세요.') }, { status: 400 })
    console.error(e)
    return NextResponse.json({ error: await te('발행하지 못했어요.') }, { status: 500 })
  }
}
