import { describe, expect, it } from 'vitest'
import { AUTHORSHIP_CHIP, parseAuthorship } from '@/lib/authorship'
import { toUntrustedFeedPost } from '@/lib/mcp-data'

describe('authorship marker', () => {
  it('parses unknown values as human; human shows no chip', () => {
    expect(parseAuthorship('ai_assisted')).toBe('ai_assisted')
    expect(parseAuthorship('robot')).toBe('human')
    expect(parseAuthorship(null)).toBe('human')
    expect(AUTHORSHIP_CHIP.human).toBeNull()
    expect(AUTHORSHIP_CHIP.ai_generated).toBeTruthy()
  })
  it('agents see the declared authorship; agent rows are "agent"', () => {
    const base = { id: 'x', parent_id: null, root_id: null, title: null, body: 'hi', url: null, link_title: null, link_description: null, agent_interaction: 'humans_only' as const, like_count: 0, reply_count: 0, created_at: '2026-11-23T00:00:00Z' }
    expect(toUntrustedFeedPost({ ...base, author: { kind: 'real', id: 'm', name: 'a' }, authorship: 'ai_generated' } as never).authorship).toBe('ai_generated')
    expect(toUntrustedFeedPost({ ...base, author: { kind: 'agent', name: 'Claude', model: null } } as never).authorship).toBe('agent')
  })
})
