import { SITE_ORIGIN } from '@/lib/invite-share'
import { FEEDBACK_SHOT_URL_TTL, feedbackWebhookBody, feedbackWebhookConfig, feedbackWebhookHeaders } from '@/lib/feedback'
import { adminRecordWebhook, signedFeedbackShot, type FeedbackDetail } from '@/lib/data/feedback'

export type DevRequestResult = { status: 'sent' | 'skipped' | 'failed'; note: string }

/**
 * Approve → dev request. The server (never the browser) POSTs the item to FEEDBACK_WEBHOOK_URL.
 * Missing env = skipped (the approval itself already stands). One try, 8 s timeout, no secrets logged.
 * The outcome is written back on the item so the inbox shows it.
 */
export async function sendDevRequest(item: FeedbackDetail, fetchImpl: typeof fetch = fetch): Promise<DevRequestResult> {
  const cfg = feedbackWebhookConfig(process.env)
  let result: DevRequestResult
  if (!cfg) {
    result = { status: 'skipped', note: 'FEEDBACK_WEBHOOK_URL / FEEDBACK_WEBHOOK_KEY not set' }
  } else {
    const shotUrl = item.screenshotPath ? await signedFeedbackShot(item.screenshotPath, FEEDBACK_SHOT_URL_TTL).catch(() => null) : null
    const body = feedbackWebhookBody(item, {
      origin: SITE_ORIGIN,
      screenshotUrl: shotUrl,
      screenshotExpiresAt: shotUrl ? new Date(Date.now() + FEEDBACK_SHOT_URL_TTL * 1000).toISOString() : null,
    })
    try {
      const res = await fetchImpl(cfg.url, { method: 'POST', headers: feedbackWebhookHeaders(cfg), body: JSON.stringify(body), signal: AbortSignal.timeout(8000), cache: 'no-store' })
      result = res.ok ? { status: 'sent', note: `HTTP ${res.status}` } : { status: 'failed', note: `HTTP ${res.status}` }
    } catch (e) {
      result = { status: 'failed', note: (e as { name?: string })?.name === 'TimeoutError' ? 'timeout (8s)' : 'network error' }
    }
  }
  await adminRecordWebhook(item.id, result.status, result.note).catch((e) => console.error('[feedback] could not record webhook result', e))
  return result
}
