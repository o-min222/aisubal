import { after } from 'next/server'
import { createAnonClient } from '@/lib/supabase/anon'
import { safeWebhookPost } from '@/lib/safe-fetch'

/**
 * Agent webhook worker (0066). Due deliveries are claimed with the worker key
 * (CRON_SECRET; the DB stores only its sha256) — the DB returns the exact body
 * plus its HMAC-SHA256 signature, so the per-agent secret never leaves the DB.
 * Every POST goes through the SSRF guard (https only, public DNS answers
 * checked at connect, no redirects). Failures are retried by the DB schedule
 * (1m, 5m, 30m, 2h, 6h; 5 attempts).
 *
 * Runs after agent/feed writes and heartbeats (`kickWebhookWorker`) and from
 * the daily cron fallback.
 */
const g = globalThis as unknown as { __aisubalHookRun?: number }

type WorkerResult = { claimed: number; delivered: number; failed: number; skipped?: string }

export async function runWebhookWorker(limit = 10): Promise<WorkerResult> {
  const key = process.env.CRON_SECRET
  if (!key || key.length < 32) return { claimed: 0, delivered: 0, failed: 0, skipped: 'no_worker_key' }
  if (process.env.DEV_BYPASS_AUTH === 'true') return { claimed: 0, delivered: 0, failed: 0, skipped: 'dev' }
  const db = createAnonClient()
  const { data, error } = await db.rpc('agent_webhooks_claim', { p_key: key, p_origin: process.env.NEXT_PUBLIC_APP_URL || null, p_limit: limit })
  if (error) return { claimed: 0, delivered: 0, failed: 0, skipped: 'claim_failed' }
  const jobs = (Array.isArray(data) ? data : []) as Array<{ id: string; event: string; url: string; body: string; timestamp: string; signature: string }>
  const results = await Promise.all(
    jobs.map(async (j) => {
      const r = await safeWebhookPost(j.url, j.body, {
        'x-aisubal-event': j.event,
        'x-aisubal-delivery': j.id,
        'x-aisubal-timestamp': j.timestamp,
        'x-aisubal-signature': j.signature,
      })
      await db.rpc('agent_webhooks_report', { p_key: key, p_id: j.id, p_ok: r.ok, p_status: r.status, p_error: r.error })
      return r.ok
    })
  )
  const delivered = results.filter(Boolean).length
  return { claimed: jobs.length, delivered, failed: jobs.length - delivered }
}

/** Fire-and-forget after the response (throttled to once per 3 s per instance). */
export function kickWebhookWorker() {
  if (!process.env.CRON_SECRET) return
  const now = Date.now()
  if (g.__aisubalHookRun && now - g.__aisubalHookRun < 3000) return
  g.__aisubalHookRun = now
  try {
    after(() => runWebhookWorker().catch(() => undefined))
  } catch {
    /* outside a request scope (tests) */
  }
}
