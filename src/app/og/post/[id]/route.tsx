import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { getShareTeaser } from '@/lib/data/share-teaser'
import { renderPostShareOg } from '@/lib/post-og'
import { sharedPostId } from '@/lib/share-teaser'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function defaultPng(): Promise<NextResponse> {
  const buf = await readFile(join(process.cwd(), 'public/images/og-default.png'))
  return new NextResponse(buf, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=300, stale-while-revalidate=86400',
    },
  })
}

/** Public share-card image for /posts/{id}. Ineligible posts get the generic branded card (no leak). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id
  if (!UUID.test(id) || sharedPostId(`/posts/${id}`) !== id.toLowerCase()) {
    return defaultPng()
  }
  const teaser = await getShareTeaser(id.toLowerCase())
  if (!teaser) return defaultPng()
  const res = await renderPostShareOg(teaser)
  res.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  res.headers.set('Content-Type', 'image/png')
  return res
}
