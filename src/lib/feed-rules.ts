import type { TimelinePost } from '@/components/timeline/types'
import type { AgentInteraction, LinkType, PostAs } from '@/lib/supabase/types'
import { nicknameProfilePublicId } from '@/lib/profile'

/** Human feed rules — shared by the API, the DB-backed data layer and tests. */
export const FEED_MAX_CHARS = 500
export const FEED_INTERACT_SCOPE = 'feed:interact'
export const AGENT_INTERACTION_LABEL: Record<AgentInteraction, string> = {
  humans_only: '사람만',
  agents_allowed: '에이전트도 허용',
}

export type FeedPostInput = {
  body: string
  parentId?: string | null
  url?: string | null
  agentInteraction?: AgentInteraction
  postedAs?: PostAs
}

export function validateFeedInput(
  input: FeedPostInput
): { ok: true; value: Required<Omit<FeedPostInput, 'url' | 'parentId'>> & { url: string | null; parentId: string | null } } | { ok: false; error: string } {
  const body = (input.body || '').trim()
  if (!body) return { ok: false, error: '내용을 입력해 주세요.' }
  if ([...body].length > FEED_MAX_CHARS) {
    return { ok: false, error: `${FEED_MAX_CHARS}자 이하로 써 주세요.` }
  }
  let url: string | null = null
  if (input.url) {
    try {
      const u = new URL(input.url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad')
      url = u.toString()
    } catch {
      return { ok: false, error: '링크 주소가 올바르지 않아요.' }
    }
  }
  const agentInteraction: AgentInteraction =
    input.agentInteraction === 'agents_allowed' ? 'agents_allowed' : 'humans_only'
  return {
    ok: true,
    value: {
      body,
      url,
      parentId: input.parentId || null,
      // replies never carry their own setting — the root post decides
      agentInteraction: input.parentId ? 'humans_only' : agentInteraction,
      postedAs: input.postedAs === 'nickname' ? 'nickname' : 'real',
    },
  }
}

/** Agents may reply/like only when the thread root explicitly allows agents. */
export function agentsMayInteract(root: { agent_interaction?: AgentInteraction | null; is_hidden?: boolean }) {
  return root.agent_interaction === 'agents_allowed' && !root.is_hidden
}

export function hasFeedScope(scopes: string[] | string): boolean {
  const list = Array.isArray(scopes) ? scopes : scopes.split(',').map((s) => s.trim())
  return list.includes(FEED_INTERACT_SCOPE)
}

export type FeedRow = {
  id: string
  parent_id: string | null
  root_id: string | null
  title: string | null
  content: string
  url: string | null
  link_title: string | null
  link_description: string | null
  link_image: string | null
  link_site_name: string | null
  link_favicon: string | null
  link_type: LinkType | null
  posted_as: PostAs
  author_kind: 'member' | 'agent'
  agent_name: string | null
  agent_model: string | null
  agent_token_id: string | null
  agent_interaction: AgentInteraction
  like_count: number
  reply_count: number
  is_hidden: boolean
  created_at: string
  author: {
    id: string
    display_name: string
    bio?: string | null
    avatar_url: string | null
    nickname: string | null
    nickname_avatar_url: string | null
  } | null
}

/**
 * DB row → shared TimelinePost. Nickname posts never expose the member id;
 * agent replies are labelled AI and show the owning member.
 */
export function feedRowToTimeline(r: FeedRow, liked: Set<string>): TimelinePost {
  const a = r.author
  let author: TimelinePost['author']
  if (r.author_kind === 'agent') {
    author = {
      kind: 'agent',
      id: r.agent_token_id || `agent-${r.id}`,
      name: r.agent_name || 'AI 에이전트',
      subtitle: r.agent_model,
      ownerName: a?.display_name ?? null,
    }
  } else if (r.posted_as === 'nickname' && a?.nickname) {
    author = {
      kind: 'member',
      id: nicknameProfilePublicId(a.id),
      name: a.nickname,
      avatarUrl: a.nickname_avatar_url,
    }
  } else {
    author = {
      kind: 'member',
      id: a?.id || 'unknown',
      name: a?.display_name || '멤버',
      avatarUrl: a?.avatar_url ?? null,
    }
  }
  const hasPreview = Boolean(r.url && (r.link_title || r.link_image || r.link_description))
  return {
    id: r.id,
    parentId: r.parent_id,
    rootId: r.root_id,
    author,
    title: r.title || null,
    body: r.content,
    linkUrl: r.url,
    imageUrl: null,
    linkPreview: hasPreview
      ? {
          url: r.url!,
          title: r.link_title,
          description: r.link_description,
          image: r.link_image,
          siteName: r.link_site_name,
          favicon: r.link_favicon,
          linkType: r.link_type,
        }
      : null,
    tool: null,
    rating: null,
    likeCount: r.like_count ?? 0,
    likedByMe: liked.has(r.id),
    replyCount: r.reply_count ?? 0,
    createdAt: r.created_at,
    isHidden: r.is_hidden,
    agentsAllowed: !r.parent_id && r.agent_interaction === 'agents_allowed',
    isNickname: r.author_kind === 'member' && r.posted_as === 'nickname' && Boolean(a?.nickname),
  }
}

/** Depth-first order so each reply sits under its parent (Threads style). */
export function orderThread<T extends { id: string; parentId: string | null }>(rootId: string, replies: T[]): Array<T & { depth: number }> {
  const byParent = new Map<string, T[]>()
  for (const r of replies) {
    const k = r.parentId || rootId
    byParent.set(k, [...(byParent.get(k) || []), r])
  }
  const out: Array<T & { depth: number }> = []
  const walk = (pid: string, depth: number) => {
    for (const c of byParent.get(pid) || []) {
      out.push({ ...c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(rootId, 0)
  return out
}
