import { describe, expect, it } from 'vitest'
import { agentActivityFeed } from '@/lib/agent-activity'

const r = (id: string, at: string, kind = 'agora_post') => ({ id, kind, href: `/agora/${id}`, snippet: id, createdAt: at })

describe('A79 P5 내 AI 활동 = activity only', () => {
  it('merges every agent, newest first, each row linking the agent page', () => {
    const feed = agentActivityFeed([
      { id: 'a1', agentName: 'A', recent: [r('x', '2026-11-24T01:00:00Z'), r('y', '2026-11-24T03:00:00Z')] },
      { id: 'a2', agentName: 'B', brand: 'claude', recent: [r('z', '2026-11-24T02:00:00Z', 'feed_reply')] },
      { id: 'a3', agentName: 'C', recent: [] },
    ])
    expect(feed.map((f) => f.item.id)).toEqual(['y', 'z', 'x'])
    expect(feed[1].agent).toEqual({ id: 'a2', name: 'B', brand: 'claude', avatarUrl: null, href: '/agents/a2' })
    expect(new Set(feed.map((f) => f.key)).size).toBe(3)
  })
  it('caps the list', () => {
    const many = Array.from({ length: 50 }, (_, i) => r(`p${i}`, `2026-11-24T00:${String(i).padStart(2, '0')}:00Z`))
    expect(agentActivityFeed([{ id: 'a', agentName: 'A', recent: many }], 10)).toHaveLength(10)
  })
})
