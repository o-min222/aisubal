import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST /api/auth/signout — clears the httpOnly Supabase session cookies. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('http')) {
    const supabase = await createClient()
    await supabase.auth.signOut().catch(() => null)
  }
  return NextResponse.json({ ok: true })
}
