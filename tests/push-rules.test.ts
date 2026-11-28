import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSubscription, pushErrorKind, pushPayload, pushPlan, safePath, vapidKeyBytes, type PushJob } from '@/lib/push-rules'
import { makeT, interpolate } from '@/i18n/translate'
import { DICTS } from '@/i18n/dict'

const job = (item: PushJob['item']): PushJob => ({ outboxId: 1, subscriptionId: 's', endpoint: 'https://fcm.googleapis.com/x', p256dh: 'B'.repeat(87), auth: 'a'.repeat(22), locale: 'ko', unread: 3, item })
const follow = { id: 'n1', kind: 'follow', category: 'social', link: '/members/m2', excerpt: null, targetKind: 'member', count: 1, createdAt: '', unread: true, actor: { kind: 'member', id: 'm2', name: '새벽CTO', avatarUrl: null } } as const

describe('web push (D1)', () => {
  it('asks right away on Android/desktop, only from a tap inside the installed app on iOS', () => {
    expect(pushPlan({ supported: true, ios: false, standalone: false, permission: 'default' })).toBe('auto')
    expect(pushPlan({ supported: false, ios: true, standalone: false, permission: 'unsupported' })).toBe('install-first')
    expect(pushPlan({ supported: true, ios: true, standalone: true, permission: 'default' })).toBe('ask')
    expect(pushPlan({ supported: true, ios: false, standalone: false, permission: 'denied' })).toBe('denied')
    expect(pushPlan({ supported: true, ios: false, standalone: true, permission: 'granted' })).toBe('granted')
    expect(pushPlan({ supported: false, ios: false, standalone: false, permission: 'unsupported' })).toBe('unsupported')
  })
  it('says what the bell says, in the member’s language, and deep-links to the target', () => {
    const ko = pushPayload(job({ ...follow }), interpolate)
    expect(ko).toMatchObject({ title: '새벽CTO님이 나를 팔로우해요', body: '', url: '/members/m2', tag: 'follow:n1', badge: 3 })
    const en = pushPayload(job({ ...follow }), makeT('en', DICTS.en))
    expect(en.title).toContain('새벽CTO')
    expect(en.title).not.toContain('팔로우')
    expect(en.body).toBe('')
    expect(pushPayload(job(null), interpolate)).toMatchObject({ url: '/settings/notifications', tag: 'test' })
  })
  it('never opens another site from a push', () => {
    expect(safePath('/feed?x=1')).toBe('/feed?x=1')
    expect(safePath('https://evil.example')).toBe('/notifications')
    expect(safePath('//evil.example')).toBe('/notifications')
    expect(safePath('/\\evil')).toBe('/notifications')
  })
  it('accepts only real browser subscriptions', () => {
    const ok = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }
    expect(parseSubscription(ok)).toEqual({ endpoint: ok.endpoint, p256dh: ok.keys.p256dh, auth: ok.keys.auth })
    expect(parseSubscription({ ...ok, endpoint: 'http://x.example/1' })).toBeNull()
    expect(parseSubscription({ ...ok, keys: { p256dh: 'short', auth: 'a'.repeat(22) } })).toBeNull()
    expect(parseSubscription({ ...ok, keys: { p256dh: 'B'.repeat(87), auth: '<script>' } })).toBeNull()
    expect(parseSubscription(null)).toBeNull()
  })
  it('expired subscriptions are deleted; other errors are counted', () => {
    expect(pushErrorKind(410)).toBe('gone')
    expect(pushErrorKind(404)).toBe('gone')
    expect(pushErrorKind(500)).toBe('failed')
    expect(pushErrorKind(undefined)).toBe('failed')
  })
  it('decodes the VAPID public key', () => {
    expect(Array.from(vapidKeyBytes('AQID'))).toEqual([1, 2, 3])
  })
  it('the DB keeps only the dispatcher secret’s hash and gates claim/report with it', () => {
    const sql = readFileSync('supabase/migrations/0075_web_push.sql', 'utf8')
    expect(sql).toContain("secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$')")
    expect(sql).toMatch(/push_dispatch_claim[\s\S]*push__secret_ok\(p_secret\)/)
    expect(sql).toContain('after insert on public.notifications')
  })
})
