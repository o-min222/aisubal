import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { runWebhookWorker } from '@/lib/agent-webhooks'

export const dynamic = 'force-dynamic'

/** Vercel cron fallback for agent webhook retries (Authorization: Bearer $CRON_SECRET). */
export async function GET(req: NextRequest) {
  const key = process.env.CRON_SECRET
  const got = req.headers.get('authorization') || ''
  const want = `Bearer ${key}`
  if (!key || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const total = { claimed: 0, delivered: 0, failed: 0 }
  for (let i = 0; i < 5; i++) {
    const r = await runWebhookWorker(25)
    total.claimed += r.claimed
    total.delivered += r.delivered
    total.failed += r.failed
    if (r.claimed < 25) break
  }
  return NextResponse.json(total)
}
