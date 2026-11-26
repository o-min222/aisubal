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
  it('folds follow posts and covers gallery outcomes', () => {
    const one = notificationSentence({ ...base, kind: 'follow_post', category: 'following' })
    expect(one.s).toBe('{name}님이 새 글을 올렸어요')
    const many = notificationSentence({ ...base, kind: 'follow_post', category: 'following', count: 3 })
    expect(many.s).toBe('{name}님이 새 글 {n}개를 올렸어요')
    expect(many.n).toBe(3)
    for (const kind of ['gallery_recommended', 'gallery_approved', 'gallery_confirmed', 'gallery_rejected'] as const) {
      expect(notificationSentence({ ...base, kind, category: 'gallery', targetKind: 'submission' }).s).toMatch(/갤러리/)
    }
  })
  it('badge caps at 99+ and hides at 0', () => {
    expect(badgeLabel(0)).toBeNull()
    expect(badgeLabel(7)).toBe('7')
    expect(badgeLabel(140)).toBe('99+')
  })
  it('feedback points admins at the inbox item', () => {
    const n = notificationSentence({ ...base, kind: 'feedback', category: 'admin', targetKind: 'feedback', link: '/admin/feedback/abc', excerpt: '[테스트] 승인 연결 확인' })
    expect(n.s).toBe('{name}님이 화면 피드백을 보냈어요')
    expect(n.name).toBe('콜린')
  })
  it('parses categories', () => {
    expect(parseNotifyCategory('likes')).toBe('likes')
    expect(parseNotifyCategory('nope')).toBeNull()
  })
})
