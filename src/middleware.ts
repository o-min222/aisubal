import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hardenAuthCookie } from '@/lib/supabase/cookie-options'
import { loginReturnPath } from '@/lib/handoff-rules'
import { verifiedUser } from '@/lib/supabase/verified-user'
import { isSharePreviewFetch, SHARE_PATH_HEADER, sharePreviewKind } from '@/lib/share-teaser'
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE, normalizeInviteCode } from '@/lib/invite-share'
import { copyResponseCookies } from '@/lib/supabase/forward-auth-cookies'
import { isPublicArticlePath } from '@/lib/article-rules'
import { isKnownRoute } from '@/lib/known-routes'


export async function middleware(request: NextRequest) {
  // Pass the request itself (not a headers snapshot) so cookie writes in setAll
  // are visible to the Server Components on this same navigation.
  let response = NextResponse.next({ request })

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
          response = NextResponse.next({ request })
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
  const publicRoutes = ['/', '/h', '/auth/callback', '/waitlist', '/i', '/t', '/join', '/og', '/api/auth', '/api/setup', '/api/mcp', '/skill.md', '/llms.txt', '/.well-known', '/not-found-page']
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  ) || isPublicArticlePath(pathname)
  
  // API routes that handle their own auth
  const isApiRoute = pathname.startsWith('/api/')

  // Dev bypass auth - auto-sign in as dev user
  const devBypass = process.env.DEV_BYPASS_AUTH === 'true'

  if (!user && !isPublicRoute && !isApiRoute && !devBypass) {
    // A149: no page serves this path, so it is a 404 for everyone; don't send people to sign in for it
    if (!isKnownRoute(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/not-found-page'
      url.search = ''
      return copyResponseCookies(response, NextResponse.rewrite(url))
    }
    // A25: keep where they were going (a shared post link) so sign-in lands back on it
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    const back = loginReturnPath(pathname, request.nextUrl.search)
    if (back) url.searchParams.set('next', back)
    // A100: link-preview scrapers (KakaoTalk, Slack, Applebot, curl, …) get the sign-in page's
    // share meta at the original URL itself; people still go to / with ?next=. Same page either
    // way: nothing beyond the teaser is rendered for a signed-out request.
    if (back && sharePreviewKind(back) && isSharePreviewFetch({
      ua: request.headers.get('user-agent'),
      secFetchMode: request.headers.get('sec-fetch-mode'),
      secFetchDest: request.headers.get('sec-fetch-dest'),
    })) {
      const headers = new Headers(request.headers)
      headers.set(SHARE_PATH_HEADER, back) // a rewrite doesn't hand ?next to the page's searchParams
      return copyResponseCookies(response, NextResponse.rewrite(url, { request: { headers } }))
    }
    return copyResponseCookies(response, NextResponse.redirect(url))
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
