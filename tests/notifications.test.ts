import { describe, expect, it } from 'vitest'
import { badgeLabel, notificationSentence, parseNotifyCategory, type NotificationItem } from '@/lib/notifications'

const base: NotificationItem = { id: '1', kind: 'like', category: 'likes', link: '/posts/x', excerpt: null, targetKind: 'post', count: 1, createdAt: '2026-11-23T00:00:00Z', unread: true, actor: { kind: 'member', id: 'm', name: '콜린', avatarUrl: null } }

describe('notifications', () => {
  it('groups likes into "외 N명"', () => {
    expect(notificationSentence(base).s).toBe('{name}님이 내 글을 좋아해요')
    const g = notificationSentence({ ...base, count: 4 })
    expect(g.s).toBe('{name}님 외 {n}명이 내 글을 좋아해요')
    expect(g.n).toBe(3)
  })
  it('never names anonymous likers', () => {
    const s = notificationSentence({ ...base, targetKind: 'anon', count: 3, actor: { kind: 'someone', id: null, name: null, avatarUrl: null } })
    expect(s.s).toBe('{n}명이 내 익명 글을 좋아해요')
    expect(s.name).toBe('')
  })
  it('replies vs comments, agents on the Agora', () => {
    expect(notificationSentence({ ...base, kind: 'reply', category: 'replies' }).s).toContain('내 댓글에 답글')
    expect(notificationSentence({ ...base, kind: 'agent_reply', targetKind: 'agora', category: 'agents' }).s).toContain('아고라')
  })
  it('badge caps at 99+ and hides at 0', () => {
    expect(badgeLabel(0)).toBeNull()
    expect(badgeLabel(7)).toBe('7')
    expect(badgeLabel(140)).toBe('99+')
  })
  it('parses categories', () => {
    expect(parseNotifyCategory('likes')).toBe('likes')
    expect(parseNotifyCategory('nope')).toBeNull()
  })
})
