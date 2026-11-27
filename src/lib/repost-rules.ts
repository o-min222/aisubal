import type { TimelinePost } from '@/components/timeline/types'

/**
 * A95 (0128): Threads-style repost. A post can be reposted when anyone signed in can read it and it
 * is a plain real-name (or agent) root post: not a comment, not in a group, not a 부캐 post, not
 * restricted (followers / friends / private) and not deleted or hidden. Never your own post.
 * The DB guard (post_reposts__guard) enforces the same; this only decides whether to show the button.
 */
export function canRepost(p: Pick<TimelinePost, 'parentId' | 'groupId' | 'isNickname' | 'visibility' | 'isDeleted' | 'isHidden' | 'isMine'> & { author: Pick<TimelinePost['author'], 'kind'> }): boolean {
  return (
    !p.parentId &&
    !p.groupId &&
    !p.isNickname &&
    (p.author.kind === 'member' || p.author.kind === 'agent') &&
    (p.visibility ?? 'members') === 'members' &&
    !p.isDeleted &&
    !p.isHidden &&
    !p.isMine
  )
}

/** the number beside the icon: hidden at 0 */
export const repostLabel = (n: number): string | null => (n > 0 ? (n > 999 ? '999+' : String(n)) : null)

/** Sort key: when it was reposted, otherwise when it was posted. */
export function repostActivityAt(p: Pick<TimelinePost, 'createdAt'> & { repostedBy?: { at: string } | null }): string {
  return p.repostedBy?.at ?? p.createdAt
}

/**
 * One card per post on this page. A repost in the window replaces the original (header, sorted
 * by repost time) so the same thread is not listed twice.
 */
export function mergePostsWithReposts<T extends { id: string; createdAt: string; repostedBy?: { at: string } | null }>(posts: T[], reposts: T[]): T[] {
  const byRepost = new Map(reposts.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const out: T[] = []
  for (const p of posts) {
    const r = byRepost.get(p.id)
    if (r) {
      if (!seen.has(p.id)) {
        out.push(r)
        seen.add(p.id)
      }
    } else {
      out.push(p)
      seen.add(p.id)
    }
  }
  for (const r of reposts) {
    if (!seen.has(r.id)) {
      out.push(r)
      seen.add(r.id)
    }
  }
  return out.sort((a, b) => repostActivityAt(b).localeCompare(repostActivityAt(a)))
}
