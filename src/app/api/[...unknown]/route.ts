import { NextResponse } from 'next/server'

/** S-5: unknown /api/* paths answer JSON 404 instead of the HTML not-found page. */
function notFound() {
  return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
}

export const GET = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
export const HEAD = notFound
export const OPTIONS = notFound
