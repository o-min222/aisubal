import { moimRecBoost } from '@/lib/moim-thread-rules'
import { interpolate, msg, type T } from '@/i18n/translate'
/** Pure helpers for the right-rail recommendations (tested in tests/shell.test.ts). */

/** Most frequent tags across the member's archive / reviewed tools / liked posts. */
export function pickInterestTags(tagLists: Array<string[] | null | undefined>, limit = 8): string[] {
  const counts = new Map<string, number>()
  for (const list of tagLists) {
    for (const raw of list || []) {
      const t = raw.trim().toLowerCase()
      if (!t || t === '내글') continue
      counts.set(t, (counts.get(t) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t)
}

type RankableTool = {
  id: string
  tags: string[]
  mention_count: number
  install_count: number
  avg_rating: number
  rating_count: number
  featured: boolean
  user_count?: number | null
}

/**
 * Members who share tools with me ("co-usage") and tag overlap dominate; popularity
 * (incl. how many members use it) breaks ties; tools I already use are skipped.
 */
export function rankToolsForMember<T extends RankableTool>(
  entries: T[],
  interestTags: string[],
  exclude: Set<string>,
  limit = 3,
  coUse: Map<string, number> = new Map()
): Array<T & { matchedTag: string | null; coUsers: number }> {
  const interest = new Set(interestTags)
  return entries
    .filter((e) => !exclude.has(e.id))
    .map((e) => {
      const matched = e.tags.map((t) => t.toLowerCase()).filter((t) => interest.has(t))
      const coUsers = coUse.get(e.id) ?? 0
      const popularity =
        (e.user_count ?? 0) * 3 +
        e.mention_count * 2 +
        e.install_count +
        Number(e.avg_rating) * e.rating_count +
        (e.featured ? 3 : 0)
      return { e, score: coUsers * 1500 + matched.length * 1000 + popularity, matchedTag: matched[0] ?? null, coUsers }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ e, matchedTag, coUsers }) => ({ ...e, matchedTag, coUsers }))
}

/** One-line reason shown under a rail recommendation. */
export function toolReason(
  t: { coUsers: number; matchedTag: string | null; user_count?: number | null },
  tr: T = interpolate,
): string | null {
  if (t.coUsers > 0) return tr('나와 같은 걸 쓰는 {n}명이 사용 중', { n: t.coUsers })
  if (t.matchedTag) return tr('#{tag} 관심사 기반', { tag: t.matchedTag })
  if ((t.user_count ?? 0) > 0) return tr('{n}명이 사용 중', { n: t.user_count ?? 0 })
  return null
}

/* ---- C: 추천 feed scope -------------------------------------------------------------- */

export type FeedRecSignals = {
  authorId: string
  /** real-name member post (relationship boosts apply only to these) */
  realName: boolean
  text: string
  toolName: string | null
  likeCount: number
  replyCount: number
  createdAt: string
  /** A30: the post is a 모임's thread */
  moim?: { startsAt: string; ended: boolean } | null
}
type FeedRecReason = { s: string; vars?: Record<string, string> }

/** An interest tag "matches" a post when the post names it as #tag, as its tool, or (≥3 chars) in the text. */
export function matchInterest(sig: Pick<FeedRecSignals, 'text' | 'toolName'>, interestTags: string[]): string | null {
  const text = sig.text.toLowerCase()
  const tool = (sig.toolName || '').toLowerCase()
  for (const tag of interestTags) {
    const t = tag.toLowerCase()
    if (!t) continue
    if (text.includes(`#${t}`) || (tool && tool.includes(t)) || (t.length >= 3 && text.includes(t))) return tag
  }
  return null
}

/**
 * 추천 score: relationship (friend > following) + interest-tag match + engagement (log),
 * all decayed by age so fresh posts surface. The dominant signal becomes the shown reason.
 */
export function scoreFeedPost(
  sig: FeedRecSignals,
  ctx: { friends: Set<string>; following: Set<string>; interestTags: string[]; now?: number }
): { score: number; reason: FeedRecReason } {
  const now = ctx.now ?? Date.now()
  const rel = sig.realName && ctx.friends.has(sig.authorId) ? 3 : sig.realName && ctx.following.has(sig.authorId) ? 2 : 0
  const tag = matchInterest(sig, ctx.interestTags)
  const interest = tag ? 1.5 : 0
  const eng = Math.log2(1 + 2 * Math.max(0, sig.likeCount) + Math.max(0, sig.replyCount))
  const { boost, maxAgeH } = moimRecBoost(sig.moim, now)
  const rawAgeH = Math.max(0, (now - new Date(sig.createdAt).getTime()) / 3600_000)
  const ageH = maxAgeH == null ? rawAgeH : Math.min(rawAgeH, maxAgeH)
  const decay = 1 / Math.pow(1 + ageH / 24, 0.8)
  const score = (1 + rel + interest + eng + boost) * decay
  const reason: FeedRecReason =
    boost > 0 ? (rel === 3 ? { s: msg('친구가 연 모임') } : rel === 2 ? { s: msg('팔로우하는 사람이 연 모임') } : { s: msg('다가오는 모임') })
    : rel === 3 ? { s: msg('친구의 글') }
    : rel === 2 ? { s: msg('팔로우하는 사람의 글') }
    : tag ? { s: msg('#{tag} 관심사와 비슷해요'), vars: { tag } }
    : eng >= Math.log2(11) ? { s: msg('반응이 많은 글') }
    : { s: msg('새로 올라온 글') }
  return { score, reason }
}

/** Rank a candidate pool: highest score first, ties → newest. */
export function rankFeedPosts<P extends { id: string; createdAt: string }>(
  pool: P[],
  signals: (p: P) => FeedRecSignals,
  ctx: { friends: Set<string>; following: Set<string>; interestTags: string[]; now?: number }
): Array<P & { recReason: FeedRecReason }> {
  return pool
    .map((p) => ({ p, ...scoreFeedPost(signals(p), ctx) }))
    .sort((a, b) => b.score - a.score || b.p.createdAt.localeCompare(a.p.createdAt))
    .map(({ p, reason }) => ({ ...p, recReason: reason }))
}
