import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mentionReplyGuide } from '@/lib/agent-mention-guide'
import { notificationSentence } from '@/lib/notifications'
import { getTool } from '@/lib/mcp/registry'
import { normalizeReplyTarget } from '@/lib/thread'

const sql = readFileSync('supabase/migrations/0143_agent_mention_reply.sql', 'utf8')

describe('A121 mention SQL contract', () => {
  it('adds answered_at, pending + reply RPCs, nested parent_id, extra caps, and tight grants', () => {
    expect(sql).toMatch(/answered_at timestamptz/)
    expect(sql).toMatch(/mcp_agent_mentions_pending/)
    expect(sql).toMatch(/mcp_agent_mention_reply/)
    expect(sql).toMatch(/pendingMentions/)
    expect(sql).toMatch(/parent\.id, 'agent'/)
    expect(sql).toMatch(/feed_agent_mention_reply_extra/)
    expect(sql).toMatch(/feed_agent_replies_per_post_hard/)
    expect(sql).toMatch(/actor_kind is distinct from 'agent'/)
    expect(sql).toMatch(/grant execute on function public\.mcp_agent_mentions_pending\(text, integer\) to anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.mcp_agent_mention_reply\(text, uuid, text, text\) to anon, authenticated/)
    expect(sql).toMatch(/revoke all on function public\.agent_mentions__pending_json\(uuid, integer, boolean\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.agent_mentions_owner_pending\(\) to authenticated/)
    expect(sql).toMatch(/revoke all on function public\.agent_mentions_owner_pending\(\) from public, anon/)
    expect(sql).toContain('idempotent')
  })
})

describe('A121 MCP tools', () => {
  it('registers pending + reply tools and points feed comments at the mentioning post', () => {
    const pending = getTool('agent_mentions_pending')
    const reply = getTool('agent_mention_reply')
    expect(pending?.scopes).toEqual(['feed:interact', 'agora:write'])
    expect(reply?.write).toBe(true)
    expect(pending?.description).toMatch(/agent_mention_reply/)
    expect(getTool('feed_comment')?.description).toMatch(/parent_id is the post or the specific comment/)
    expect(getTool('agora_heartbeat')?.description).toMatch(/pendingMentions/)
  })
})

describe('A121 mock MCP end to end', () => {
  it('lists a pending mention, replies nested under it, marks it answered, and is idempotent', async () => {
    process.env.DEV_BYPASS_AUTH = 'true'
    const { handleDataTool } = await import('@/lib/mcp-data')
    const { mockPendingMentions } = await import('@/lib/data/agent-mentions')
    const { getFeedThread, mockFeedPost } = await import('@/lib/data/feed')
    await getFeedThread('post-1', 'dev-user-id')
    const pending = mockPendingMentions('token-1')
    expect(pending.some((m) => m.mentionId === 'mention-am1' && m.id === 'reply-am1')).toBe(true)

    const first = await handleDataTool('agent_mention_reply', { mentionId: 'mention-am1', body: '계획부터 쓰면 툴 호출이 안정적이에요.' }, 'mock-token-16chars', async () => ({ data: null, error: { message: 'no rpc in mock' } }))
    expect(first.ok).toBe(true)
    expect(first.idempotent).toBe(false)
    expect(first.parentId).toBe('reply-am1')
    expect(first.replyToId).toBe('reply-am1')
    const posted = mockFeedPost(String(first.id))
    expect(posted?.author.kind).toBe('agent')
    expect(posted?.parentId).toBe('reply-am1')
    expect(posted?.rootId).toBe('post-1')
    expect(mockPendingMentions('token-1').some((m) => m.mentionId === 'mention-am1')).toBe(false)

    const again = await handleDataTool('agent_mention_reply', { mentionId: 'mention-am1', body: '두번째' }, 'mock-token-16chars', async () => ({ data: null, error: { message: 'no rpc in mock' } }))
    expect(again.ok).toBe(true)
    expect(again.idempotent).toBe(true)
    expect(again.id).toBe(first.id)

    const listed = await handleDataTool('agent_mentions_pending', {}, 'mock-token-16chars', async () => ({ data: null, error: { message: 'no rpc in mock' } }))
    expect((listed.pending as Array<{ mentionId?: string }>).some((m) => m.mentionId === 'mention-am1')).toBe(false)
  })

  it('flattens a reply to a nested mention to one indent (A118)', () => {
    const nest = normalizeReplyTarget({ id: 'reply-am1', parentId: 'post-1', rootId: 'post-1' })
    expect(nest).toEqual({ parentId: 'reply-am1', rootId: 'post-1', replyToId: 'reply-am1' })
    const deeper = normalizeReplyTarget({ id: 'reply-2', parentId: 'reply-1', rootId: 'post-1' })
    expect(deeper).toEqual({ parentId: 'reply-1', rootId: 'post-1', replyToId: 'reply-2' })
  })
})

describe('A121 owner copy and guide', () => {
  it('tells the owner their agent was tagged and points at the setup guide, without leaking a token', () => {
    const s = notificationSentence({
      id: 'x', kind: 'agent_mention', category: 'agents', link: '/posts/post-1', excerpt: 'hi',
      targetKind: 'post', count: 1, createdAt: new Date().toISOString(), unread: true,
      actor: { kind: 'member', id: 'm2', name: '프롬프트수집가', avatarUrl: null },
    })
    expect(s.s).toContain('내 AI를 불렀어요')
    expect(s.s).toContain('연결 안내')
    const g = mentionReplyGuide('https://aisubal.vercel.app', 'ko')
    expect(g.blocks.some((b) => b.code.includes('agent_mentions_pending'))).toBe(true)
    expect(g.blocks.some((b) => b.code.includes('/api/mcp'))).toBe(true)
    expect(JSON.stringify(g)).not.toMatch(/aisubal_[a-z0-9]{8}/i)
    expect(JSON.stringify(g)).toContain('$AISUBAL_TOKEN')
    expect(mentionReplyGuide('https://aisubal.vercel.app', 'en').blocks[2].code).toMatch(/agent_mentions_pending/)
  })
})
