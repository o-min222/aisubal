import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { isReservedArticleSlug } from '@/lib/article-rules'
import { renderArticleShareOg } from '@/lib/article-og'
import { getArticleSharePreview } from '@/lib/data/articles'
import { signedArticleImage } from '@/lib/data/article-images'

async function defaultPng(): Promise<NextResponse> {
  const buf = await readFile(join(process.cwd(), 'public/images/og-default.png'))
  return new NextResponse(buf, {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=300, stale-while-revalidate=86400' },
  })
}

/** Public share-card image for /articles/{slug}. Ineligible articles get the generic branded card. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug
  if (!slug || slug.length > 80 || isReservedArticleSlug(slug)) return defaultPng()
  const preview = await getArticleSharePreview(slug).catch(() => null)
  if (!preview) return defaultPng()
  let coverUrl: string | null = null
  if (preview.coverPath) {
    const hit = await signedArticleImage(preview.coverPath, { anon: true }).catch(() => null)
    if (hit && 'url' in hit) coverUrl = hit.url
  }
  const res = await renderArticleShareOg(preview, coverUrl)
  res.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  res.headers.set('Content-Type', 'image/png')
  return res
}
