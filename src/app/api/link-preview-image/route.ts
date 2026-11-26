import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { fetchPreviewImageBytes } from '@/lib/link-preview-image'
import { BlockedUrlError, checkFetchUrl } from '@/lib/safe-fetch'

/**
 * Member-only OG image proxy (A104). `url` is the preview's *page* address.
 * The og:image is fetched server-side (SSRF-safe, type-sniffed, size-capped)
 * so the browser never hits a signed/hotlink-blocked CDN URL.
 */
export async function GET(request: NextRequest) {
  const member = await getMember()
  if (!member) return new NextResponse(null, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
  const raw = request.nextUrl.searchParams.get('url')
  if (!raw || raw.length > 2000) return new NextResponse(null, { status: 400, headers: { 'Cache-Control': 'private, no-store' } })
  const check = checkFetchUrl(raw)
  if (!check.ok) return new NextResponse(null, { status: 422, headers: { 'Cache-Control': 'private, no-store' } })
  try {
    const img = await fetchPreviewImageBytes(raw)
    if (!img) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'private, max-age=60' } })
    return new NextResponse(new Uint8Array(img.body), {
      status: 200,
      headers: {
        'Content-Type': img.contentType,
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    })
  } catch (e) {
    if (e instanceof BlockedUrlError) return new NextResponse(null, { status: 422, headers: { 'Cache-Control': 'private, no-store' } })
    console.error('link-preview-image error')
    return new NextResponse(null, { status: 500, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
