import webpush from 'web-push'
import { createAnonClient } from '@/lib/supabase/anon'
import { pushErrorKind, pushPayload, type PushJob } from '@/lib/push-rules'
import { makeT } from '@/i18n/translate'
import { DICTS } from '@/i18n/dict'
import type { Locale } from '@/i18n/config'

/**
 * Sends queued pushes (D1). The outbox lives in the DB (0075); claim/report are SECURITY DEFINER RPCs gated by
 * PUSH_DISPATCH_SECRET (the DB keeps only its sha256), so this runs on the anon key. Never logs endpoints or keys.
 */
export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT && process.env.PUSH_DISPATCH_SECRET)
}

const g = globalThis as unknown as { __aisubalPushRun?: Promise<DispatchResult> | null }
export type DispatchResult = { configured: boolean; sent: number; gone: number; failed: number }

/** One run at a time per instance; a nudge during a run just joins it. */
export function dispatchPush(): Promise<DispatchResult> {
  if (g.__aisubalPushRun) return g.__aisubalPushRun
  const run = drain().finally(() => {
    g.__aisubalPushRun = null
  })
  g.__aisubalPushRun = run
  return run
}

async function drain(): Promise<DispatchResult> {
  const out: DispatchResult = { configured: pushConfigured(), sent: 0, gone: 0, failed: 0 }
  if (!out.configured) return out
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
  const secret = process.env.PUSH_DISPATCH_SECRET!
  const sb = createAnonClient()
  for (let round = 0; round < 4; round++) {
    const { data, error } = await sb.rpc('push_dispatch_claim', { p_secret: secret, p_limit: 50 })
    if (error) throw new Error('push_claim_failed')
    const jobs = (data ?? []) as PushJob[]
    if (!jobs.length) break
    const ok: string[] = []
    const gone: string[] = []
    const failed: string[] = []
    const retry = new Set<number>()
    const delivered = new Set<number>()
    await Promise.all(
      jobs.map(async (j) => {
        const loc = (j.locale === 'en' ? 'en' : 'ko') as Locale
        const payload = pushPayload(j, makeT(loc, DICTS[loc]))
        try {
          await webpush.sendNotification({ endpoint: j.endpoint, keys: { p256dh: j.p256dh, auth: j.auth } }, JSON.stringify(payload), { TTL: 86400, urgency: 'normal' })
          ok.push(j.subscriptionId)
          delivered.add(j.outboxId)
        } catch (e) {
          const kind = pushErrorKind((e as { statusCode?: number }).statusCode)
          ;(kind === 'gone' ? gone : failed).push(j.subscriptionId)
          if (kind === 'failed') retry.add(j.outboxId)
        }
      })
    )
    // an outbox row is done once any device got it; rows where every device hit a transient error retry (3 attempts)
    const done = [...new Set(jobs.map((j) => j.outboxId))].filter((id) => delivered.has(id) || !retry.has(id))
    await sb.rpc('push_dispatch_report', { p_secret: secret, p_done: done, p_ok: ok, p_gone: gone, p_failed: failed })
    out.sent += ok.length
    out.gone += gone.length
    out.failed += failed.length
    if (jobs.length < 50) break
  }
  return out
}
