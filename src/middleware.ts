import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hardenAuthCookie } from '@/lib/supabase/cookie-options'
import { verifiedUser } from '@/lib/supabase/verified-user'

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

  // API routes handle their own auth (session cookie or Bearer token), so skip
  // the extra Supabase Auth round trip here.
  if (pathname.startsWith('/api/')) {
    return response
  }

  // Refresh session; verify the token locally (see verifiedUser)
  const user = await verifiedUser(supabase)
  
  // Public routes that don't require auth
  const publicRoutes = ['/', '/login', '/h', '/auth/callback', '/waitlist', '/i', '/api/auth', '/api/setup', '/api/mcp', '/skill.md']
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  )
  
  // API routes that handle their own auth
  const isApiRoute = pathname.startsWith('/api/')

  // Dev bypass auth - auto-sign in as dev user
  const devBypass = process.env.DEV_BYPASS_AUTH === 'true'

  if (!user && !isPublicRoute && !isApiRoute && !devBypass) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.png|images|icons|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)',
  ],
}
