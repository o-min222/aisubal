import type { NextResponse } from 'next/server'

/** Copy Set-Cookie values from a middleware response onto a later redirect or rewrite. */
export function copyResponseCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie)
  return to
}
