import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/**
 * A105 화면 피드백 — the server-side, pure parts: the submit shape, the dev-request webhook
 * request, and the HMAC check for the bot's progress callback. Client-only parts (picker,
 * selector, 7-tap logo) live in feedback-client.ts.
 */

export const FEEDBACK_STATUSES = ['pending', 'approved', 'rejected', 'in_progress', 'deployed'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]
export const isFeedbackStatus = (v: unknown): v is FeedbackStatus => typeof v === 'string' && (FEEDBACK_STATUSES as readonly string[]).includes(v)

export type FeedbackBox = { x: number; y: number; width: number; height: number; pageX: number; pageY: number }
export type FeedbackViewport = { width: number; height: number; dpr: number }

export type FeedbackItem = {
  id: string
  status: FeedbackStatus
  body: string
  route: string
  viewport: Partial<FeedbackViewport>
  theme: 'light' | 'dark' | null
  locale: 'ko' | 'en' | null
  selector: string | null
  component: string | null
  elementText: string | null
  bbox: Partial<FeedbackBox> | null
  userAgent: string | null
  hasShot: boolean
  adminNote: string | null
  reviewedAt: string | null
  webhookStatus: 'sent' | 'skipped' | 'failed' | null
  webhookNote: string | null
  webhookAt: string | null
  progressNote: string | null
  progressAt: string | null
  createdAt: string
  updatedAt: string
  author: { id: string; name: string; handle: string | null; avatarUrl: string | null } | null
}

const num = z.number().finite().min(-100000).max(100000)
export const feedbackMetaSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  route: z.string().trim().min(1).max(500).refine((s) => s.startsWith('/') && !s.startsWith('//'), 'route'),
  viewport: z.object({ width: num, height: num, dpr: z.number().finite().min(0.5).max(8) }),
  theme: z.enum(['light', 'dark']).nullable(),
  locale: z.enum(['ko', 'en']).nullable(),
  selector: z.string().max(500).nullable(),
  component: z.string().max(200).nullable(),
  elementText: z.string().max(300).nullable(),
  bbox: z.object({ x: num, y: num, width: num, height: num, pageX: num, pageY: num }).nullable(),
})
export type FeedbackMeta = z.infer<typeof feedbackMetaSchema>

export const FEEDBACK_SHOT_MAX_BYTES = 6_000_000 // raw upload; the server re-encodes to WebP ≤ 1.5 MB
export const FEEDBACK_SHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const feedbackShotPath = (authId: string, id: string) => `${authId}/${id}.webp`
/** The webhook's screenshot link lives this long (seconds). */
export const FEEDBACK_SHOT_URL_TTL = 6 * 60 * 60

export const feedbackAdminPath = (id: string) => `/admin/feedback/${id}`

/* ---------- approve → dev request webhook ---------- */

export type FeedbackWebhookConfig = { url: string; key: string; header: string | null }

/** FEEDBACK_WEBHOOK_URL + FEEDBACK_WEBHOOK_KEY (+ optional FEEDBACK_WEBHOOK_HEADER). null = not set up yet. */
export function feedbackWebhookConfig(env: Record<string, string | undefined>): FeedbackWebhookConfig | null {
  const url = (env.FEEDBACK_WEBHOOK_URL || '').trim()
  const key = (env.FEEDBACK_WEBHOOK_KEY || '').trim()
  if (!url || !key) return null
  try {
    if (new URL(url).protocol !== 'https:') return null
  } catch {
    return null
  }
  const header = (env.FEEDBACK_WEBHOOK_HEADER || '').trim()
  return { url, key, header: /^[A-Za-z0-9-]{1,64}$/.test(header) ? header : null }
}

/**
 * Default: both `Authorization: Bearer <key>` and `X-Automation-Key: <key>` (what a Grok Bot
 * webhook routine accepts). FEEDBACK_WEBHOOK_HEADER=<name> sends only that header instead
 * (`Bearer <key>` when the name is Authorization, the bare key otherwise).
 */
export function feedbackWebhookHeaders(c: FeedbackWebhookConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'aisubal-feedback/1' }
  if (!c.header) return { ...h, Authorization: `Bearer ${c.key}`, 'X-Automation-Key': c.key }
  return { ...h, [c.header]: c.header.toLowerCase() === 'authorization' ? `Bearer ${c.key}` : c.key }
}

export type FeedbackWebhookBody = {
  type: 'aisubal.feedback.approved'
  feedback_id: string
  status: FeedbackStatus
  comment: string
  admin_note: string | null
  route: string
  page_url: string
  viewport: Partial<FeedbackViewport>
  theme: string | null
  locale: string | null
  selector: string | null
  component: string | null
  element_text: string | null
  bbox: Partial<FeedbackBox> | null
  user_agent: string | null
  author: { id: string; name: string; handle: string | null } | null
  created_at: string
  approved_at: string | null
  admin_url: string
  screenshot_url: string | null
  screenshot_expires_at: string | null
  progress_url: string
}

export function feedbackWebhookBody(
  f: FeedbackItem,
  o: { origin: string; screenshotUrl: string | null; screenshotExpiresAt: string | null }
): FeedbackWebhookBody {
  return {
    type: 'aisubal.feedback.approved',
    feedback_id: f.id,
    status: f.status,
    comment: f.body,
    admin_note: f.adminNote,
    route: f.route,
    page_url: `${o.origin}${f.route}`,
    viewport: f.viewport,
    theme: f.theme,
    locale: f.locale,
    selector: f.selector,
    component: f.component,
    element_text: f.elementText,
    bbox: f.bbox,
    user_agent: f.userAgent,
    author: f.author ? { id: f.author.id, name: f.author.name, handle: f.author.handle } : null,
    created_at: f.createdAt,
    approved_at: f.reviewedAt,
    admin_url: `${o.origin}${feedbackAdminPath(f.id)}`,
    screenshot_url: o.screenshotUrl,
    screenshot_expires_at: o.screenshotUrl ? o.screenshotExpiresAt : null,
    progress_url: `${o.origin}/api/feedback/progress`,
  }
}

/* ---------- bot → POST /api/feedback/progress ---------- */

export const PROGRESS_MAX_SKEW_S = 300
export const progressBodySchema = z.object({
  feedback_id: z.string().uuid(),
  status: z.enum(['in_progress', 'deployed']),
  note: z.string().max(500).optional().nullable(),
})

/** hex HMAC-SHA256 of `${timestamp}.${rawBody}` */
export function progressSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

/** X-Feedback-Timestamp (unix seconds) within 5 minutes, X-Feedback-Signature `sha256=<hex>` matching. */
export function verifyProgressSignature(
  secret: string | undefined,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
  nowS: number
): boolean {
  if (!secret || !timestamp || !signature || !/^\d{9,11}$/.test(timestamp)) return false
  if (Math.abs(nowS - Number(timestamp)) > PROGRESS_MAX_SKEW_S) return false
  const got = signature.startsWith('sha256=') ? signature.slice(7) : signature
  if (!/^[0-9a-f]{64}$/i.test(got)) return false
  const want = progressSignature(secret, timestamp, rawBody)
  return timingSafeEqual(Buffer.from(want, 'hex'), Buffer.from(got.toLowerCase(), 'hex'))
}
