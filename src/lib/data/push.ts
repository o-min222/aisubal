import { sb, isMock } from './client'

/** This member's push devices (0075). Mock mode keeps them in memory for local review. */
const g = globalThis as unknown as { __pushMock?: Map<string, { p256dh: string; auth: string; lastTest: number }> }
const mock = () => (g.__pushMock ??= new Map())

export async function subscribePush(s: { endpoint: string; p256dh: string; auth: string }, ua: string | null): Promise<void> {
  if (isMock()) return void mock().set(s.endpoint, { p256dh: s.p256dh, auth: s.auth, lastTest: 0 })
  const { error } = await (await sb()).rpc('push_subscribe', { p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth, p_ua: ua?.slice(0, 300) ?? null })
  if (error) throw new Error('push_subscribe_failed')
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  if (isMock()) return void mock().delete(endpoint)
  const { error } = await (await sb()).rpc('push_unsubscribe', { p_endpoint: endpoint })
  if (error) throw new Error('push_unsubscribe_failed')
}

export async function pushSubscribed(endpoint: string): Promise<boolean> {
  if (isMock()) return mock().has(endpoint)
  const { data, error } = await (await sb()).rpc('push_status', { p_endpoint: endpoint })
  if (error) throw new Error('push_status_failed')
  return data === true
}

export type PushTestResult = 'queued' | 'not_subscribed' | 'rate_limited' | 'not_member'
export async function queuePushTest(endpoint: string): Promise<PushTestResult> {
  if (isMock()) {
    const s = mock().get(endpoint)
    if (!s) return 'not_subscribed'
    if (Date.now() - s.lastTest < 20_000) return 'rate_limited'
    s.lastTest = Date.now()
    return 'queued'
  }
  const { data, error } = await (await sb()).rpc('push_test', { p_endpoint: endpoint })
  if (error) throw new Error('push_test_failed')
  return data as PushTestResult
}
