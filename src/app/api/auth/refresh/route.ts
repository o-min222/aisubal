import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { shouldRefreshSession } from '@/lib/session-keep-alive'

/**
 * POST /api/auth/refresh — refresh the httpOnly Supabase session when it is close
 * to expiry. The browser client cannot write those cookies (they are httpOnly).
 * Returns no tokens. 204 when there is no session (signed out).
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('http')) {
    return new NextResponse(null, { status: 204 })
  }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) return new NextResponse(null, { status: 204 })
  if (shouldRefreshSession(data.session.expires_at)) {
    const refreshed = await supabase.auth.refreshSession()
    if (refreshed.data.session) {
      return NextResponse.json({ ok: true, expiresAt: refreshed.data.session.expires_at ?? null })
    }
    // Transient failure: keep existing cookies; the client retries. Do not 401 (looks like a logout).
    return NextResponse.json({ ok: false, expiresAt: data.session.expires_at ?? null }, { status: 503 })
  }
  return NextResponse.json({ ok: true, expiresAt: data.session.expires_at ?? null })
}
