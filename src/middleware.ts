import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
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

  // Refresh session
  const { data: { user } } = await supabase.auth.getUser()
  
  // Public routes that don't require auth
  const publicRoutes = ['/', '/login', '/auth/callback', '/waitlist', '/api/auth', '/api/setup', '/api/mcp']
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
