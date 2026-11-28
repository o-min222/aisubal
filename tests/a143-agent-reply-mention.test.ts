import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mentionedAgentHandles } from '@/lib/agent-handle'
import { replyMentionPrefill, stripLeadingReplyMention, nestThread, replyToRefFrom } from '@/lib/thread'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('A143 · agent mentions in replies', () => {
  it('Hangul @handle without .ai is an agent mention; .ai still wins', () => {
    expect(mentionedAgentHandles('@쓰발이 답글 테스트해보려고')).toEqual(['쓰발이'])
    expect(mentionedAgentHandles('@쓰발이.ai 너도 안녕')).toEqual(['쓰발이'])
    expect(mentionedAgentHandles('@소연이_2.ai 살아났군')).toEqual(['소연이_2'])
    expect(mentionedAgentHandles('hi @grok_bot no suffix, @grok_bot.ai yes')).toEqual(['grok_bot'])
  })

  it('the reply prefix is a linked mention and the prefill uses @handle.ai', () => {
    const card = read('src/components/timeline/post-card.tsx')
    expect(card).toContain('reply-mention mention')
    expect(card).toContain('mention-agent')
    expect(card).toContain('stripLeadingReplyMention')
    expect(card).not.toMatch(/<span className="reply-mention">@\{replyTo\}<\/span>/)
    expect(replyMentionPrefill({ parentId: 'a', author: { handle: '쓰발이', kind: 'agent' } }, 'root')).toBe('@쓰발이.ai ')
    expect(stripLeadingReplyMention('@쓰발이.ai 너도 안녕', { name: '쓰발이', handle: '쓰발이', kind: 'agent' })).toBe('너도 안녕')
  })

  it('a nested reply to an agent carries the handle, not just the display name', () => {
    const soyeon = {
      id: 'a1',
      parentId: 'a',
      replyToId: null as string | null,
      createdAt: '2026-11-28T10:00:00Z',
      author: { name: '소연이', handle: '소연이_2', kind: 'agent' as const, profileHref: '/agents/token' },
    }
    const reply = {
      id: 'a2',
      parentId: 'a',
      replyToId: 'a1',
      createdAt: '2026-11-28T11:00:00Z',
      author: { name: '남도', handle: 'namd0', kind: 'member' as const },
    }
    const groups = nestThread('root', [
      { id: 'a', parentId: 'root', createdAt: '2026-11-28T09:00:00Z', author: { name: '남도', handle: 'namd0', kind: 'member' } },
      soyeon,
      reply,
    ])
    expect(groups[0].children[1].replyToName).toBe('소연이')
    expect(groups[0].children[1].replyTo).toEqual(replyToRefFrom(soyeon.author))
    expect(groups[0].children[1].replyTo?.handle).toBe('소연이_2')
    expect(groups[0].children[1].replyTo?.href).toBe('/agents/token')
  })

  it('0157 queues a reply to an agent, returns handle on cards, and backfills without notifying', () => {
    const sql = read('supabase/migrations/0157_agent_reply_mention.sql')
    expect(sql).toContain('v_target_token is not null')
    expect(sql).toContain('insert into public.agent_mentions')
    expect(sql).toContain("[가-힣][0-9a-z_가-힣]{0,19}")
    expect(sql).toContain("'handle', t.agent_handle")
    expect(sql).toContain('on conflict do nothing')
    expect(sql).toMatch(/Backfill: mention rows only/)
    const backfill = sql.slice(sql.indexOf('Backfill:'))
    expect(backfill).not.toContain('notify__push')
    expect(backfill).not.toContain('webhook__enqueue')
    const cards = read('src/lib/data/agent-profiles.ts')
    expect(cards).toContain('handle: c.handle ?? p.author.handle ?? null')
  })
})
