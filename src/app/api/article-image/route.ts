import { NextRequest, NextResponse } from 'next/server'
import { getUserState } from '@/lib/auth'
import { ARTICLE_IMAGE_KINDS, ARTICLE_IMAGE_MAX_BYTES, type ArticleImageKind } from '@/lib/article-rules'
import { ArticleImageError, listArticleImages, registerArticleImage, signedArticleImage, uploadArticleImage } from '@/lib/data/article-images'
import { te } from '@/i18n/server'

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('p') ?? ''
  if (!path || path.length > 200) return new NextResponse(null, { status: 404 })
  const state = await getUserState()
  const hit = await signedArticleImage(path, { anon: state.type !== 'member' }).catch(() => null)
  if (!hit) return new NextResponse(null, { status: 404 })
  const bytes = 'mock' in hit ? hit.mock : 'blob' in hit ? hit.blob : null
  if (bytes) {
    return new NextResponse(new Uint8Array(bytes.bytes), {
      headers: { 'content-type': bytes.type, 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff' },
    })
  }
  if (!('url' in hit)) return new NextResponse(null, { status: 404 })
  return NextResponse.redirect(hit.url, { status: 302, headers: { 'cache-control': 'private, max-age=300' } })
}

export async function POST(request: NextRequest) {
  const state = await getUserState()
  if (state.type !== 'member') return NextResponse.json({ error: await te('로그인이 필요해요.') }, { status: 401 })
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: await te('이미지를 선택해 주세요.') }, { status: 400 })
  if (file.size > ARTICLE_IMAGE_MAX_BYTES) return NextResponse.json({ error: await te('이미지가 너무 커요. 4MB 이하로 올려 주세요.') }, { status: 400 })
  // A136: covers and thumbnails are saved to the member's library so a later article can pick them again.
  const rawKind = String(form?.get('kind') ?? 'inline')
  const kind: ArticleImageKind = (ARTICLE_IMAGE_KINDS as readonly string[]).includes(rawKind) ? (rawKind as ArticleImageKind) : 'inline'
  if (kind !== 'inline') {
    const lib = await listArticleImages(1).catch(() => null)
    if (lib && lib.total >= lib.cap) return NextResponse.json({ error: await te('이미지 보관함이 가득 찼어요. 안 쓰는 이미지를 지우고 다시 올려 주세요.'), code: 'library_full' }, { status: 409 })
  }
  try {
    const path = await uploadArticleImage(state.member.auth_id, file)
    const image = kind === 'inline' ? null : await registerArticleImage(path, kind, file.name).catch(() => null)
    return NextResponse.json({ path, url: `/api/article-image?p=${encodeURIComponent(path)}`, image })
  } catch (e) {
    if (e instanceof ArticleImageError && e.message === 'image_type') {
      return NextResponse.json({ error: await te('JPEG, PNG, WebP, GIF만 올릴 수 있어요.') }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: await te('이미지를 올리지 못했어요.') }, { status: 500 })
  }
}
