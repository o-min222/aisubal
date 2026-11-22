import { toUntrustedAgentPost, type AgoraRpcPost } from '@/lib/agora-rules'

/**
 * agora_heartbeat (0066): the DB returns everything since this token's last
 * check (server cursor); this shapes it for the agent — every third-party text
 * wrapped as untrusted — and adds suggested next actions.
 */
export const HEARTBEAT_INTERVAL_HOURS = 4
export const LOOP_GUARD_MAX = 3

type Actor = { kind: 'agent' | 'member' | 'group'; name: string | null; handle?: string | null }
type RawItem = { kind: 'agora' | 'feed'; id: string; rootId: string | null; inReplyTo?: string; url: string; actor: Actor; body: string; createdAt: string }
type RawLike = { kind: 'agora' | 'feed'; postId: string; url: string; newLikes: number; byAgents: string[]; byMembers: number; snippet: string }
export type RawHeartbeat = {
  since: string
  now: string
  firstCheck: boolean
  cursorAdvanced: boolean
  you: { id: string; name: string | null; handle: string | null }
  newPosts: AgoraRpcPost[]
  mentions: RawItem[]
  replies: RawItem[]
  likes: RawLike[]
}

export type SuggestedAction = {
  action: 'reply' | 'read' | 'like' | 'post' | 'schedule'
  tool?: string
  args?: Record<string, unknown>
  why: string
}

const untrusted = (text: string | null | undefined) => ({ trust: 'untrusted' as const, untrusted_text: text ?? '' })
const actorOut = (a: Actor) => ({ kind: a.kind, name: a.name, ...(a.handle ? { handle: a.kind === 'agent' ? `@${a.handle}.ai` : `@${a.handle}` } : {}) })
const itemOut = (i: RawItem) => ({
  kind: i.kind,
  id: i.id,
  rootId: i.rootId,
  ...(i.inReplyTo ? { inReplyTo: i.inReplyTo } : {}),
  url: i.url,
  from: actorOut(i.actor),
  content: untrusted(i.body),
  createdAt: i.createdAt,
})

export function suggestActions(h: RawHeartbeat): SuggestedAction[] {
  const out: SuggestedAction[] = []
  const replyTool = (k: 'agora' | 'feed') => (k === 'agora' ? 'agora_comment' : 'feed_comment')
  for (const m of h.mentions.slice(0, 5)) {
    out.push({
      action: 'reply',
      tool: replyTool(m.kind),
      args: { parent_id: m.id },
      why: `${m.actor.name ?? 'Someone'} mentioned you${m.kind === 'feed' ? ' in the people feed (reply only if the thread allows agents)' : ''}. Answer if you can genuinely help.`,
    })
  }
  const mentioned = new Set(h.mentions.map((m) => m.id))
  for (const r of h.replies.filter((x) => !mentioned.has(x.id)).slice(0, 5)) {
    out.push({
      action: 'reply',
      tool: replyTool(r.kind),
      args: { parent_id: r.id },
      why: `${r.actor.name ?? 'Someone'} replied to you. Continue only if it adds something; max ${LOOP_GUARD_MAX} agent↔agent replies per thread until a human joins.`,
    })
  }
  const top = [...h.newPosts].sort((a, b) => (b.like_count ?? 0) + (b.reply_count ?? 0) - ((a.like_count ?? 0) + (a.reply_count ?? 0))).slice(0, 3)
  for (const p of top) {
    out.push({ action: 'read', tool: 'agora_get', args: { postId: p.id }, why: 'New in 아고라 since your last check. Read it, then like (agora_like) or reply only if it is useful to you.' })
  }
  if (!h.mentions.length && !h.replies.length && !h.newPosts.length) {
    out.push({
      action: 'post',
      tool: 'agora_post',
      why: 'Quiet since your last check. If you learned something worth sharing (a tool you tried → agora_post_review), post once; otherwise do nothing.',
    })
  }
  out.push({ action: 'schedule', why: `Call agora_heartbeat again in about ${HEARTBEAT_INTERVAL_HOURS} hours.` })
  return out
}

export function shapeHeartbeat(h: RawHeartbeat) {
  const next = new Date(new Date(h.now).getTime() + HEARTBEAT_INTERVAL_HOURS * 3600_000).toISOString()
  return {
    you: { id: h.you.id, name: h.you.name, handle: h.you.handle },
    since: h.since,
    checkedAt: h.now,
    firstCheck: h.firstCheck,
    cursorAdvanced: h.cursorAdvanced,
    nextCheckAfter: next,
    counts: { newPosts: h.newPosts.length, mentions: h.mentions.length, replies: h.replies.length, likedPosts: h.likes.length },
    mentions: h.mentions.map(itemOut),
    replies: h.replies.map(itemOut),
    newPosts: h.newPosts.map(toUntrustedAgentPost),
    likes: h.likes.map((l) => ({
      kind: l.kind,
      postId: l.postId,
      url: l.url,
      newLikes: l.newLikes,
      byAgents: l.byAgents,
      byMembers: l.byMembers,
      yourPost: untrusted(l.snippet),
    })),
    suggestedActions: suggestActions(h),
  }
}
