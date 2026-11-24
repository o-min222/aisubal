import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hardenAuthCookie } from '@/lib/supabase/cookie-options'
import { loginReturnPath } from '@/lib/handoff-rules'
import { verifiedUser } from '@/lib/supabase/verified-user'
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE, normalizeInviteCode } from '@/lib/invite-share'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, hardenAuthCookie(options))
          )
        },
      },
    }
  )

  const pathname = request.nextUrl.pathname

  // A65c: one signed-out screen. /login (old links, bookmarks, the OAuth error path) is now /, query kept.
  if (pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // API routes handle their own auth (session cookie or Bearer token), so skip
  // the extra Supabase Auth round trip here.
  if (pathname.startsWith('/api/')) {
    return response
  }

  // Refresh session; verify the token locally (see verifiedUser)
  const user = await verifiedUser(supabase)
  
  // Public routes that don't require auth
  const publicRoutes = ['/', '/h', '/auth/callback', '/waitlist', '/i', '/t', '/join', '/api/auth', '/api/setup', '/api/mcp', '/skill.md', '/.well-known']
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  )
  
  // API routes that handle their own auth
  const isApiRoute = pathname.startsWith('/api/')

  // Dev bypass auth - auto-sign in as dev user
  const devBypass = process.env.DEV_BYPASS_AUTH === 'true'

  if (!user && !isPublicRoute && !isApiRoute && !devBypass) {
    // A25: keep where they were going (a shared post link) so sign-in lands back on it
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    const back = loginReturnPath(pathname, request.nextUrl.search)
    if (back) url.searchParams.set('next', back)
    return NextResponse.redirect(url)
  }

  // /i/{code}: save the code (httpOnly, 30 min) so signup fills it in after the Google round trip
  const invite = /^\/i\/([^/]+)$/.exec(pathname)
  const inviteCode = invite ? normalizeInviteCode(decodeURIComponent(invite[1])) : null
  if (inviteCode) {
    response.cookies.set(INVITE_COOKIE, inviteCode, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: INVITE_COOKIE_MAX_AGE })
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.png|images|icons|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)',
  ],
}
