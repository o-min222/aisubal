import { after, NextRequest, NextResponse } from 'next/server'
import { getMember } from '@/lib/auth'
import { queuePushTest } from '@/lib/data/push'
import { dispatchPush } from '@/lib/push-server'
import { useMockData as isMock } from '@/lib/data/client'

const H = { 'Cache-Control': 'no-store' }

/** Settings → '테스트 알림 보내기': queue a test for this device only, then send it now. */
export async function POST(req: NextRequest) {
  if (!(await getMember())) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: H })
  const { endpoint } = ((await req.json().catch(() => ({}))) ?? {}) as { endpoint?: unknown }
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: H })
  try {
    const status = await queuePushTest(endpoint)
    if (status === 'queued' && !isMock()) after(() => dispatchPush().catch(() => {}))
    return NextResponse.json({ status }, { status: status === 'queued' ? 200 : status === 'rate_limited' ? 429 : 400, headers: H })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: H })
  }
}
