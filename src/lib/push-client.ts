import { isStandalone } from '@/lib/pwa-install'
import { pushPlan, vapidKeyBytes, type PushPlan } from '@/lib/push-rules'

/** Browser side of web push (D1). Only this device's endpoint ever leaves the browser, in a POST body. */
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && Boolean(VAPID)
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

export function currentPushPlan(): PushPlan {
  const supported = pushSupported()
  return pushPlan({ supported, ios: isIos(), standalone: isStandalone(), permission: supported ? Notification.permission : 'unsupported' })
}

async function registration(): Promise<ServiceWorkerRegistration> {
  if (!(await navigator.serviceWorker.getRegistration('/'))) await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  return navigator.serviceWorker.ready
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

export type EnableResult = 'on' | 'denied' | 'dismissed' | 'unsupported' | 'error'

/** Ask (first, so iOS still sees the tap), subscribe, and save the subscription for this member. */
export async function enablePush(): Promise<EnableResult> {
  if (!pushSupported()) return 'unsupported'
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (perm === 'denied') return 'denied'
  if (perm !== 'granted') return 'dismissed'
  try {
    const reg = await registration()
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(VAPID) as BufferSource }))
    const r = await fetch('/api/push/subscribe', json(sub.toJSON()))
    return r.ok ? 'on' : 'error'
  } catch {
    return 'error'
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
