import type { TimelinePost } from '@/components/timeline/types'

export type Enricher = (posts: TimelinePost[]) => Promise<TimelinePost[]>

/**
 * A67: each enricher maps the same list in order and sets only its own fields (follow chip on
 * member authors, group identity on group rows, agent photo/link on agent authors, 모임 cards,
 * comment previews), so they run at once — one round trip instead of a chain — and their changes are merged.
 */
export async function enrichAll(posts: TimelinePost[], steps: Enricher[]): Promise<TimelinePost[]> {
  if (!posts.length || !steps.length) return posts
  const results = await Promise.all(steps.map((f) => f(posts)))
  return posts.map((p, i) => {
    let out = p
    for (const r of results) {
      const q = r[i]
      if (!q || q === p) continue
      const patch: Record<string, unknown> = {}
      for (const k of Object.keys(q) as Array<keyof TimelinePost>) if (q[k] !== p[k]) patch[k] = q[k]
      out = { ...out, ...patch }
    }
    return out
  })
}

/** Likes only set likedByMe, so posts are built without them and patched once the like lookup lands. */
export function markLiked(posts: TimelinePost[], liked: Set<string>): TimelinePost[] {
  return posts.map((p) => (liked.has(p.id) ? { ...p, likedByMe: true } : p))
}
