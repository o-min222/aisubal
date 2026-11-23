import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { pushSubscribed } from '@/lib/data/push'

const H = { 'Cache-Control': 'no-store' }

/** Is this device's endpoint saved for me? (POST so the endpoint never lands in a URL or access log.) */
export async function POST(req: NextRequest) {
  if (!(await getMember())) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: H })
  const { endpoint } = ((await req.json().catch(() => ({}))) ?? {}) as { endpoint?: unknown }
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return NextResponse.json({ subscribed: false }, { headers: H })
  try {
    return NextResponse.json({ subscribed: await pushSubscribed(endpoint) }, { headers: H })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: H })
  }
}
