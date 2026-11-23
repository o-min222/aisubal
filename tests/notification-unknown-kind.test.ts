import { describe, expect, it } from 'vitest'
import { notificationSentence, type NotificationItem } from '@/lib/notifications'

describe('notification rows survive kinds this build does not know', () => {
  it('gives an unknown kind a neutral sentence instead of undefined', () => {
    const n = { id: 'x', kind: 'some_future_kind', category: 'social', link: '/notifications', excerpt: null, targetKind: 'member', count: 1, createdAt: new Date().toISOString(), unread: true, actor: { kind: 'member', id: 'm', name: '누군가', avatarUrl: null } } as unknown as NotificationItem
    expect(notificationSentence(n)).toEqual({ s: '새 알림이 있어요', name: '누군가', n: 0 })
  })
})
