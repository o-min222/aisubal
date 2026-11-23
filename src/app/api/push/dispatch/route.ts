import { NextRequest, NextResponse } from 'next/server'
import { dispatchPush } from '@/lib/push-server'

export const maxDuration = 30
const H = { 'Cache-Control': 'no-store' }

/**
 * Nudged by the DB (pg_net) whenever a push is queued, and swept daily by Vercel Cron. The nudge carries
 * nothing: the work is gated inside the DB by PUSH_DISPATCH_SECRET, so a stray call can only drain the queue.
 * Answers with counts only.
 */
async function run() {
  try {
    const r = await dispatchPush()
    return NextResponse.json(r, { headers: H })
  } catch {
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 500, headers: H })
  }
}

export async function POST() {
  return run()
}

export async function GET(req: NextRequest) {
  const key = process.env.CRON_SECRET
  if (!key || req.headers.get('authorization') !== `Bearer ${key}`) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: H })
  return run()
}
