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
