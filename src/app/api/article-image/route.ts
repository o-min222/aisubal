import { NextRequest, NextResponse } from 'next/server'
import { getUserState } from '@/lib/auth'
import { ARTICLE_IMAGE_MAX_BYTES } from '@/lib/article-rules'
import { ArticleImageError, signedArticleImage, uploadArticleImage } from '@/lib/data/article-images'
import { te } from '@/i18n/server'

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('p') ?? ''
  if (!path || path.length > 200) return new NextResponse(null, { status: 404 })
  const state = await getUserState()
  const hit = await signedArticleImage(path, { anon: state.type !== 'member' }).catch(() => null)
  if (!hit) return new NextResponse(null, { status: 404 })
  if ('mock' in hit) {
    return new NextResponse(new Uint8Array(hit.mock.bytes), { headers: { 'content-type': hit.mock.type, 'cache-control': 'private, max-age=300' } })
  }
  return NextResponse.redirect(hit.url, { status: 302, headers: { 'cache-control': 'private, max-age=300' } })
}

export async function POST(request: NextRequest) {
  const state = await getUserState()
  if (state.type !== 'member') return NextResponse.json({ error: await te('로그인이 필요해요.') }, { status: 401 })
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: await te('이미지를 선택해 주세요.') }, { status: 400 })
  if (file.size > ARTICLE_IMAGE_MAX_BYTES) return NextResponse.json({ error: await te('이미지가 너무 커요. 4MB 이하로 올려 주세요.') }, { status: 400 })
  try {
    const path = await uploadArticleImage(state.member.auth_id, file)
    return NextResponse.json({ path, url: `/api/article-image?p=${encodeURIComponent(path)}` })
  } catch (e) {
    if (e instanceof ArticleImageError && e.message === 'image_type') {
      return NextResponse.json({ error: await te('JPEG, PNG, WebP, GIF만 올릴 수 있어요.') }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: await te('이미지를 올리지 못했어요.') }, { status: 500 })
  }
}
