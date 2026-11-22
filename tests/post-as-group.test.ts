import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { feedRowToTimeline, validateFeedInput, type FeedRow } from '@/lib/feed-rules'
import { toUntrustedFeedPost } from '@/lib/mcp-data'

// B14: group owners/mods post under the group's identity; the writer never leaves the server
// except to that group's owner/mods (group_post_authors RPC).
const row = (over: Partial<FeedRow>): FeedRow =>
  ({
    id: 'p1', parent_id: null, root_id: null, title: '', content: 'hi', url: null, link_title: null, link_description: null,
    link_image: null, link_site_name: null, link_favicon: null, link_type: null, posted_as: 'real', author_kind: 'member',
    agent_name: null, agent_model: null, agent_token_id: null, agent_interaction: 'humans_only', like_count: 0, reply_count: 0,
    is_hidden: false, created_at: '2026-11-23T00:00:00Z', author: null, ...over,
  }) as FeedRow

describe('post as group', () => {
  it('a group row shows the group, never a member', () => {
    const p = feedRowToTimeline(row({ posted_as: 'group', as_group_id: 'g1', grp: { id: 'g1', slug: 'cc', name: 'Claude Code 실전' }, public_author_id: null }), new Set(), 'viewer')
    expect(p.author).toMatchObject({ kind: 'group', id: 'group_g1', name: 'Claude Code 실전', profileHref: '/groups/cc' })
    expect(p.isMine).toBe(false) // filled later from posts_mine()
    expect(JSON.stringify(p)).not.toMatch(/viewer/)
  })

  it('replies and 부캐 never carry a group identity', () => {
    const v = validateFeedInput({ body: 'x', parentId: 'p0', asGroupId: 'g1' })
    expect(v.ok && v.value.asGroupId).toBe(null)
    const w = validateFeedInput({ body: 'x', asGroupId: 'g1', postedAs: 'nickname' })
    expect(w.ok && w.value.postedAs).toBe('real')
  })

  it('MCP reads say "group" with a postedAsGroup field and no writer', () => {
    const out = toUntrustedFeedPost({
      id: 'p1', parent_id: null, root_id: null, author: { kind: 'group', id: 'g1', name: 'Claude Code 실전' }, title: null, body: 'hi', url: null,
      link_title: null, link_description: null, agent_interaction: 'humans_only', like_count: 0, reply_count: 0, created_at: 'x',
      as_group: { id: 'g1', slug: 'cc', name: 'Claude Code 실전' },
    })
    expect(out.author).toEqual({ type: 'group', name: 'Claude Code 실전' })
    expect(out).toMatchObject({ postedAsGroup: { slug: 'cc', name: 'Claude Code 실전', url: '/groups/cc' } })
  })

  it('the DB keeps the writer out of public_author_id and gates the reveal', () => {
    const sql = readFileSync('supabase/migrations/0065_post_as_group.sql', 'utf8')
    expect(sql).toMatch(/posted_as in \('nickname', 'group'\) then null/)
    expect(sql).toMatch(/group_post_authors[\s\S]*in \('owner', 'mod'\)/)
    expect(sql).toMatch(/group_identity_root_only/)
  })
})
