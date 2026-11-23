import { NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { parseSubscription } from '@/lib/push-rules'
import { subscribePush, unsubscribePush } from '@/lib/data/push'

const H = { 'Cache-Control': 'no-store' }

/** Save (POST) or forget (DELETE) this device's push subscription (D1). */
export async function POST(req: NextRequest) {
  if (!(await getMember())) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: H })
  const sub = parseSubscription(await req.json().catch(() => null))
  if (!sub) return NextResponse.json({ error: 'invalid_subscription' }, { status: 400, headers: H })
  try {
    await subscribePush(sub, req.headers.get('user-agent'))
    return NextResponse.json({ ok: true }, { headers: H })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: H })
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await getMember())) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: H })
  const { endpoint } = ((await req.json().catch(() => ({}))) ?? {}) as { endpoint?: unknown }
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: H })
  try {
    await unsubscribePush(endpoint)
    return NextResponse.json({ ok: true }, { headers: H })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: H })
  }
}
