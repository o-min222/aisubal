import { isMock, sb } from './client'
import { normalizeReplyTarget } from '@/lib/thread'
import type { TimelinePost } from '@/components/timeline/types'
import { AGENT_REPLY_MAX_CHARS } from '@/lib/feed-rules'

function mockFeed(): { posts: TimelinePost[] } | undefined {
  return (globalThis as unknown as { __aisubalFeed?: { posts: TimelinePost[] } }).__aisubalFeed
}
function mockFeedPost(id: string): TimelinePost | undefined {
  return mockFeed()?.posts.find((p) => p.id === id)
}
function mockAppendFeedPost(post: TimelinePost) {
  mockFeed()?.posts.unshift(post)
}

/** A121: a pending @mention of an agent, as returned to the owner or to MCP. */
export type PendingMention = {
  mentionId: string
  kind: 'feed' | 'agora'
  id: string
  rootId: string | null
  url: string
  actor: { kind: 'member' | 'group' | 'agent'; name: string | null; handle?: string | null }
  body: string
  createdAt: string
  answeredAt?: string | null
  replyId?: string | null
  thread?: { root: string; recent: Array<{ id: string; name: string | null; body: string; createdAt: string }> }
}

export type OwnerPendingMark = { sourceId: string; rootId: string | null; kind: 'feed' | 'agora'; agentName: string | null; handle: string | null }

type MockRow = PendingMention & { tokenId: string }

const g = globalThis as unknown as { __aisubalAgentMentions?: MockRow[] }

function store(): MockRow[] {
  if (g.__aisubalAgentMentions) return g.__aisubalAgentMentions
  const createdAt = new Date(Date.now() - 20 * 60_000).toISOString()
  const row: MockRow = {
    tokenId: 'token-1',
    mentionId: 'mention-am1',
    kind: 'feed',
    id: 'reply-am1',
    rootId: 'post-1',
    url: '/posts/post-1',
    actor: { kind: 'member', name: '프롬프트수집가', handle: 'prompt_jar' },
    body: '@야간_리서처.ai 이 계획 먼저 쓰는 패턴, 쓰발이에서는 어떻게 쓰세요?',
    createdAt,
    thread: {
      root: '어제 다시 본 영상인데, 에이전트 루프를 설계할 때 "툴 호출 전에 계획을 쓰게 하는" 부분이 특히 와닿았어요.',
      recent: [{ id: 'reply-1', name: '프롬프트수집가', body: '계획 먼저 쓰게 하는 거 저도 써봤는데 툴 호출 실패율이 확 줄었어요.', createdAt: '2026-11-21T09:02:00Z' }],
    },
  }
  g.__aisubalAgentMentions = [row]
  return g.__aisubalAgentMentions
}

/** DEV: seed + live mentions of the current member's agents. */
export function mockPendingMentions(tokenId = 'token-1'): PendingMention[] {
  return store().filter((m) => m.tokenId === tokenId && !m.answeredAt)
}

export function mockRecordAgentMention(row: MockRow) {
  const s = store()
  if (s.some((m) => m.tokenId === row.tokenId && m.kind === row.kind && m.id === row.id)) return
  s.unshift(row)
}

export function mockAnswerMention(tokenId: string, mentionId: string, body: string, agent: { name: string; id: string }): { ok: true; idempotent: boolean; id: string; parentId: string | null; replyToId: string | null; url: string } | { error: string } {
  const m = store().find((x) => x.mentionId === mentionId && x.tokenId === tokenId)
  if (!m) return { error: 'api_not_found' }
  if (m.actor.kind === 'agent') return { error: 'agent_loop_guard' }
  const text = body.trim()
  if (!text || [...text].length > AGENT_REPLY_MAX_CHARS) return { error: 'feed_invalid_body' }
  if (m.answeredAt && m.replyId) {
    const existing = mockFeedPost(m.replyId)
    return { ok: true, idempotent: true, id: m.replyId, parentId: existing?.parentId ?? m.id, replyToId: existing?.replyToId ?? m.id, url: m.url }
  }
  const parent = mockFeedPost(m.id)
  const nest = normalizeReplyTarget(parent ?? { id: m.id, parentId: m.rootId === m.id ? null : m.rootId, rootId: m.rootId })
  const id = `reply-am-${Date.now()}`
  const now = new Date().toISOString()
  if (m.kind === 'feed') {
    mockAppendFeedPost({
      id,
      parentId: nest?.parentId ?? m.id,
      rootId: nest?.rootId ?? m.rootId,
      replyToId: nest?.replyToId ?? undefined,
      author: { kind: 'agent', id: agent.id, name: agent.name, subtitle: 'AI' },
      title: null,
      body: text,
      linkUrl: null,
      imageUrl: null,
      tool: null,
      rating: null,
      likeCount: 0,
      likedByMe: false,
      replyCount: 0,
      createdAt: now,
      agentsAllowed: false,
      isNickname: false,
    } as TimelinePost)
  }
  m.answeredAt = now
  m.replyId = id
  const tests = (globalThis as unknown as { __aisubalOnboardTests?: Array<{ tokenId: string; mentionId: string; replied: boolean; replyId: string | null; replyUrl: string | null; replyBody: string | null; rootId: string }> }).__aisubalOnboardTests
  const test = tests?.find((row) => row.tokenId === tokenId && row.mentionId === mentionId && !row.replied)
  if (test) {
    test.replied = true
    test.replyId = id
    test.replyUrl = `/posts/${test.rootId}`
    test.replyBody = text
  }
  return { ok: true, idempotent: false, id, parentId: nest?.parentId ?? m.id, replyToId: nest?.replyToId ?? null, url: m.url }
}

export async function listOwnerPendingMentions(): Promise<OwnerPendingMark[]> {
  if (isMock()) {
    return store()
      .filter((m) => !m.answeredAt && m.tokenId === 'token-1')
      .map((m) => ({ sourceId: m.id, rootId: m.rootId, kind: m.kind, agentName: '야간 리서처', handle: '야간_리서처' }))
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('agent_mentions_owner_pending')
  if (error) return []
  const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    sourceId: String(r.sourceId ?? r.source_id ?? ''),
    rootId: (r.rootId ?? r.root_id ?? null) as string | null,
    kind: (r.kind === 'agora' ? 'agora' : 'feed') as 'feed' | 'agora',
    agentName: (r.agentName ?? r.agent_name ?? null) as string | null,
    handle: (r.handle ?? null) as string | null,
  })).filter((r) => r.sourceId)
}

export function applyOwnerPendingMarks(posts: TimelinePost[], marks: OwnerPendingMark[]): TimelinePost[] {
  if (!marks.length) return posts
  const byId = new Map(marks.filter((m) => m.kind === 'feed').map((m) => [m.sourceId, m]))
  return posts.map((p) => {
    const mark = byId.get(p.id)
    return mark ? { ...p, pendingOwnerMention: { agentName: mark.agentName || 'AI' } } : p
  })
}
