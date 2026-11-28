import { NextRequest, NextResponse } from 'next/server'
import { getUserState } from '@/lib/auth'
import { ArticleImageError, listArticleImages, removeArticleImage } from '@/lib/data/article-images'
import { te } from '@/i18n/server'

/** A136: the signed-in member's own image library (RLS: owner only). */
export async function GET() {
  const state = await getUserState()
  if (state.type !== 'member') return NextResponse.json({ error: await te('로그인이 필요해요.') }, { status: 401 })
  try {
    return NextResponse.json(await listArticleImages(60), { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: await te('이미지를 불러오지 못했어요.') }, { status: 500 })
  }
}

/** Remove one image from the library. Articles that already use it keep it. */
export async function DELETE(request: NextRequest) {
  const state = await getUserState()
  if (state.type !== 'member') return NextResponse.json({ error: await te('로그인이 필요해요.') }, { status: 401 })
  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: await te('이미지를 찾지 못했어요.') }, { status: 400 })
  try {
    return NextResponse.json(await removeArticleImage(id))
  } catch (e) {
    if (e instanceof ArticleImageError && e.message === 'not_found') return NextResponse.json({ error: await te('이미지를 찾지 못했어요.') }, { status: 404 })
    console.error(e)
    return NextResponse.json({ error: await te('지우지 못했어요.') }, { status: 500 })
  }
}
