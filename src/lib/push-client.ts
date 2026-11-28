import { isStandalone } from '@/lib/pwa-install'
import { PUSH_OFFER_KEY, classifyPushError, pushPlan, shouldOfferPush, vapidKeyBytes, type PushFailure, type PushPlan } from '@/lib/push-rules'

/** Browser side of web push (D1). Only this device's endpoint ever leaves the browser, in a POST body. */
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && Boolean(VAPID)
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

export function currentPushPlan(): PushPlan {
  const supported = pushSupported()
  return pushPlan({ supported, ios: isIos(), standalone: isStandalone(), permission: supported ? Notification.permission : 'unsupported' })
}

/** A service worker that never activates would leave the switch spinning forever: give up after 10s. */
async function registration(): Promise<ServiceWorkerRegistration> {
  if (!(await navigator.serviceWorker.getRegistration('/'))) await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('sw_timeout')), 10_000)))
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function deviceSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/')
  return reg ? reg.pushManager.getSubscription() : null
}

/** On only when this browser holds a subscription the server has saved for this member. */
export async function isPushOn(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const sub = await deviceSubscription()
  if (!sub) return false
  const r = await fetch('/api/push/status', json({ endpoint: sub.endpoint })).catch(() => null)
  return Boolean(r?.ok && ((await r.json()) as { subscribed?: boolean }).subscribed)
}

export type EnableResult = 'on' | 'dismissed' | 'unsupported' | PushFailure

async function subscribe(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
  const opts = { userVisibleOnly: true, applicationServerKey: vapidKeyBytes(VAPID) as BufferSource }
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing
  try {
    return await reg.pushManager.subscribe(opts)
  } catch (e) {
    // a stale subscription made with another key: drop it and try once more
    if ((e as { name?: string }).name !== 'InvalidStateError') throw e
    await (await reg.pushManager.getSubscription())?.unsubscribe().catch(() => false)
    return reg.pushManager.subscribe(opts)
  }
}

/**
 * Ask (first, inside the tap, so iOS and quiet-permission browsers see the gesture), subscribe,
 * and save the subscription for this member. Every failure comes back named (A50).
 */
export async function enablePush(): Promise<EnableResult> {
  if (!pushSupported()) return 'unsupported'
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (perm === 'denied') return 'denied'
  // 'default': the prompt was closed, or the browser showed only its quiet bell icon (Edge/Chrome on Windows)
  if (perm !== 'granted') return 'dismissed'
  try {
    const sub = await subscribe(await registration())
    const r = await fetch('/api/push/subscribe', json(sub.toJSON()))
    if (!r.ok) console.warn('[push] save failed', r.status)
    return r.ok ? 'on' : 'error'
  } catch (e) {
    console.warn('[push] subscribe failed', (e as Error)?.name, (e as Error)?.message)
    return classifyPushError(e, Notification.permission)
  }
}

/** Re-read the permission when it changes in site settings, so unblocking needs no reload. */
export function watchPushPermission(onChange: () => void): () => void {
  let status: PermissionStatus | null = null
  let live = true
  navigator.permissions
    ?.query({ name: 'notifications' as PermissionName })
    .then((s) => {
      if (!live) return
      status = s
      s.onchange = onChange
    })
    .catch(() => {})
  const vis = () => document.visibilityState === 'visible' && onChange()
  document.addEventListener('visibilitychange', vis)
  return () => {
    live = false
    if (status) status.onchange = null
    document.removeEventListener('visibilitychange', vis)
  }
}

export async function disablePush(): Promise<void> {
  const sub = await deviceSubscription()
  if (!sub) return
  await fetch('/api/push/subscribe', { ...json({ endpoint: sub.endpoint }), method: 'DELETE' }).catch(() => null)
  await sub.unsubscribe().catch(() => false)
}

export async function sendTestPush(): Promise<'queued' | 'rate_limited' | 'not_subscribed' | 'error'> {
  const sub = await deviceSubscription()
  if (!sub) return 'not_subscribed'
  const r = await fetch('/api/push/test', json({ endpoint: sub.endpoint })).catch(() => null)
  if (!r) return 'error'
  const s = ((await r.json().catch(() => ({}))) as { status?: string }).status
  return s === 'queued' || s === 'rate_limited' || s === 'not_subscribed' ? s : 'error'
}

/** A28: right after you post or comment (you'll want to hear the replies), offer push with one tap. */
export function offerPushAfterPosting(t: { ask: string; action: string; on: string; failed: string }, toast: { message: (m: string, o: { action: { label: string; onClick: () => void }; duration: number }) => unknown; success: (m: string) => unknown; error: (m: string) => unknown }) {
  try {
    const plan = currentPushPlan()
    const last = Number(localStorage.getItem(PUSH_OFFER_KEY)) || null
    if (!shouldOfferPush(plan, last, Date.now())) return
    localStorage.setItem(PUSH_OFFER_KEY, String(Date.now()))
    toast.message(t.ask, {
      duration: 8000,
      action: {
        label: t.action,
        onClick: () => void enablePush().then((r) => (r === 'on' ? toast.success(t.on) : r === 'dismissed' ? null : toast.error(t.failed))),
      },
    })
  } catch {
    /* storage blocked: skip the offer */
  }
}
