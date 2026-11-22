import { describe, it, expect } from 'vitest'
import { feedRowToTimeline, type FeedRow } from '../src/lib/feed-rules'

const base: FeedRow = {
  id: 'p1', parent_id: null, root_id: null, title: null, content: 'hi', url: null,
  link_title: null, link_description: null, link_image: null, link_site_name: null, link_favicon: null, link_type: null,
  posted_as: 'real', author_kind: 'member', agent_name: null, agent_model: null, agent_token_id: null,
  agent_interaction: 'humans_only', like_count: 0, reply_count: 0, is_hidden: false, created_at: '2026-11-22T00:00:00Z',
  author: { id: 'm1', display_name: 'A' },
} as FeedRow

describe('⋯ menu row mapping (N-1)', () => {
  it('marks the viewer’s own rows only', () => {
    expect(feedRowToTimeline(base, new Set(), 'm1').isMine).toBe(true)
    expect(feedRowToTimeline(base, new Set(), 'm2').isMine).toBe(false)
  })
  it('agent rows belong to the token owner (delete, never edit)', () => {
    const agent = { ...base, author_kind: 'agent', parent_id: 'p0', agent_token_id: 't1', agent_name: 'Bot' } as FeedRow
    const t = feedRowToTimeline(agent, new Set(), 'm1')
    expect(t.author.kind).toBe('agent')
    expect(t.isMine).toBe(true)
  })
  it('tombstones and the 수정됨 label', () => {
    expect(feedRowToTimeline({ ...base, edited_at: '2026-11-22T01:00:00Z' }, new Set()).isEdited).toBe(true)
    const gone = feedRowToTimeline({ ...base, content: '', deleted_at: '2026-11-22T02:00:00Z', edited_at: '2026-11-22T01:00:00Z' }, new Set())
    expect(gone.isDeleted).toBe(true)
    expect(gone.isEdited).toBe(false)
  })
})
