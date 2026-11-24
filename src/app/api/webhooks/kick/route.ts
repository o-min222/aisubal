import { NextResponse } from 'next/server'
import { runWebhookWorker } from '@/lib/agent-webhooks'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * A66 P5: the DB's `webhook-kick` cron (every minute, only when a delivery is due) pings this so wake
 * events reach agents within about a minute. Unauthenticated on purpose: it only runs the keyed worker,
 * which claims due deliveries itself; throttled per instance and it reveals nothing but a count.
 */
const g = globalThis as unknown as { __aisubalKick?: number }
const GAP_MS = 3000

async function kick() {
  const now = Date.now()
  if (g.__aisubalKick && now - g.__aisubalKick < GAP_MS) return NextResponse.json({ ok: true, throttled: true }, { headers: { 'cache-control': 'no-store' } })
  g.__aisubalKick = now
  let delivered = 0
  for (let i = 0; i < 3; i++) {
    const r = await runWebhookWorker(25).catch(() => ({ claimed: 0, delivered: 0 }))
    delivered += r.delivered
    if (r.claimed < 25) break
  }
  return NextResponse.json({ ok: true, delivered }, { headers: { 'cache-control': 'no-store' } })
}

export const POST = kick
export const GET = kick
