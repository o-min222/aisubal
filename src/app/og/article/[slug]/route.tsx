import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { articleShareImagePaths, isReservedArticleSlug } from '@/lib/article-rules'
import { renderArticleShareOg } from '@/lib/article-og'
import { getArticleSharePreview } from '@/lib/data/articles'
import { articleImageForOg } from '@/lib/data/article-images'

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
  // A136: cover, else thumbnail, else the first body image the logged-out teaser may show, else the text card.
  // A candidate the viewer may not read (article_image_ok) falls through to the next one.
  const candidates = articleShareImagePaths(preview)
  let coverUrl: string | null = null
  for (const path of candidates) {
    coverUrl = await articleImageForOg(path)
    if (coverUrl) break
  }
  const res = await renderArticleShareOg(preview, coverUrl)
  res.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  res.headers.set('Content-Type', 'image/png')
  return res
}
