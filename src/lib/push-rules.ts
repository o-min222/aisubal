import { notificationSentence, type NotificationItem } from '@/lib/notifications'
import { msg } from '@/i18n/translate'

/** Web push (D1), pure parts: when to ask, what a push says, how to read a send failure. */

export type PushPlan = 'unsupported' | 'install-first' | 'auto' | 'ask' | 'granted' | 'denied'

/**
 * Android/desktop Chrome: ask right away (the onboarding step). iOS: only inside the installed app,
 * and only from a tap (Safari ignores requests without one). Anything else without PushManager: unsupported.
 */
export function pushPlan(s: { supported: boolean; ios: boolean; standalone: boolean; permission: NotificationPermission | 'unsupported' }): PushPlan {
  if (s.ios && !s.standalone) return 'install-first'
  if (!s.supported || s.permission === 'unsupported') return 'unsupported'
  if (s.permission === 'granted') return 'granted'
  if (s.permission === 'denied') return 'denied'
  return s.ios ? 'ask' : 'auto'
}

/** VAPID public key (base64url) → the bytes PushManager.subscribe wants. */
export function vapidKeyBytes(key: string): Uint8Array {
  const pad = '='.repeat((4 - (key.length % 4)) % 4)
  const b64 = (key + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/
/** What a browser hands us after subscribe(); anything else is refused before it reaches the DB. */
export function parseSubscription(v: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  const o = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null
  const endpoint = typeof o?.endpoint === 'string' ? o.endpoint : ''
  const p256dh = typeof o?.keys?.p256dh === 'string' ? o.keys.p256dh : ''
  const auth = typeof o?.keys?.auth === 'string' ? o.keys.auth : ''
  try {
    if (new URL(endpoint).protocol !== 'https:' || endpoint.length > 1000) return null
  } catch {
    return null
  }
  if (!B64URL.test(p256dh) || p256dh.length < 40 || p256dh.length > 200) return null
  if (!B64URL.test(auth) || auth.length < 10 || auth.length > 100) return null
  return { endpoint, p256dh, auth }
}

export type PushJob = { outboxId: number; subscriptionId: string; endpoint: string; p256dh: string; auth: string; locale: string; unread: number; item: (NotificationItem & { targetId?: string | null }) | null }
export type PushPayload = { title: string; body: string; url: string; tag: string; badge: number }
type Tr = (s: string, vars?: Record<string, string | number>) => string

export const PUSH_TEST_TEXT = msg('테스트 알림이에요. 이 기기에서 푸시가 잘 와요.')

/** Same sentence as the bell (one string per case), opening the notification's own target. */
export function pushPayload(job: PushJob, t: Tr): PushPayload {
  if (!job.item) return { title: 'AI쓰발', body: t(PUSH_TEST_TEXT), url: '/settings/notifications', tag: 'test', badge: job.unread }
  const n = job.item
  const { s, name, n: count } = notificationSentence(n)
  const sentence = t(s, { name, n: count })
  const body = n.excerpt ? `${sentence}\n${n.excerpt}` : sentence
  return { title: 'AI쓰발', body: body.slice(0, 240), url: safePath(n.link), tag: `${n.kind}:${n.targetId ?? n.id}`, badge: job.unread }
}

/** Only same-site paths open from a push. */
export function safePath(link: string | null | undefined): string {
  return typeof link === 'string' && link.startsWith('/') && !link.startsWith('//') && !link.includes('\\') ? link : '/notifications'
}

/** 404/410: the browser dropped the subscription (expired, unsubscribed) → delete it. */
export function pushErrorKind(status: number | undefined): 'gone' | 'failed' {
  return status === 404 || status === 410 ? 'gone' : 'failed'
}
