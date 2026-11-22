import type { CookieOptions } from '@supabase/ssr'

/**
 * S-2: Supabase session cookies (sb-<ref>-auth-token*) are written only by the
 * server (middleware, route handlers, auth callback), so they are httpOnly and
 * Secure in production. The browser client is used only to start the OAuth
 * redirect (its PKCE verifier cookie is written by the browser itself and read
 * once by /auth/callback); sign-out goes through POST /api/auth/signout.
 */
export function hardenAuthCookie(options: CookieOptions = {}): CookieOptions {
  return {
    ...options,
    path: options.path ?? '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  }
}
