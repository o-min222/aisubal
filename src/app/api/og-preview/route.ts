import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { fetchLinkPreview } from '@/lib/link-preview-server'
import { BlockedUrlError, checkFetchUrl } from '@/lib/safe-fetch'
import { te } from '@/i18n/server'

/**
 * Link preview for the composer carousel and Agora cards (members only).
 * SSRF-safe fetch + server cache live in lib/link-preview-server.ts.
 */
async function handle(raw: unknown) {
  const member = await getMember()
  if (!member) return NextResponse.json({ error: await te('인증이 필요합니다.') }, { status: 401 })
  if (!raw || typeof raw !== 'string' || raw.length > 2000) {
    return NextResponse.json({ error: await te('URL이 필요합니다.') }, { status: 400 })
  }
  const check = checkFetchUrl(raw)
  if (!check.ok) return NextResponse.json({ error: await te('미리보기를 만들 수 없는 주소예요.'), reason: check.reason }, { status: 422 })
  try {
    const preview = await fetchLinkPreview(raw)
    return NextResponse.json({ preview }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
  } catch (error) {
    if (error instanceof BlockedUrlError) {
      return NextResponse.json({ error: await te('미리보기를 만들 수 없는 주소예요.'), reason: error.reason }, { status: 422 })
    }
    console.error('OG preview error:', error)
    return NextResponse.json({ error: await te('미리보기 실패') }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handle(request.nextUrl.searchParams.get('url'))
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return handle((body as { url?: unknown }).url)
}
