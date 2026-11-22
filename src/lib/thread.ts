/**
 * Two-level comment threads (댓글 + 대댓글). The DB already stores replies this way
 * (0029); this fold also handles older/mock data nested deeper, so every view shows
 * root → comments → replies, with an @mention when a reply answers another reply.
 */
export type ThreadPost = {
  id: string
  parentId: string | null
  replyToId?: string | null
  createdAt: string
  author: { name: string }
}
export type ThreadReply<T> = { post: T; replyToName: string | null }
export type CommentGroup<T> = { comment: T; replies: ThreadReply<T>[] }

/** Reply groups longer than this start collapsed behind '답글 N개 보기'. */
export const REPLY_FOLD_AT = 2

export function twoLevelThread<T extends ThreadPost>(rootId: string, posts: T[]): CommentGroup<T>[] {
  const byId = new Map(posts.map((p) => [p.id, p]))
  const isComment = (p: T) => !p.parentId || p.parentId === rootId || !byId.has(p.parentId)
  const commentOf = (p: T): T => {
    let cur = p
    const seen = new Set<string>()
    while (!isComment(cur) && !seen.has(cur.id)) {
      seen.add(cur.id)
      cur = byId.get(cur.parentId!)!
    }
    return cur
  }
  const groups = new Map<string, CommentGroup<T>>()
  for (const p of posts) if (isComment(p)) groups.set(p.id, { comment: p, replies: [] })
  for (const p of posts) {
    if (isComment(p)) continue
    const c = commentOf(p)
    const target = p.replyToId || p.parentId
    const replyToName = target && target !== c.id ? byId.get(target)?.author.name ?? null : null
    groups.get(c.id)?.replies.push({ post: p, replyToName })
  }
  const byTime = (a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt)
  const out = [...groups.values()].sort((a, b) => byTime(a.comment, b.comment))
  for (const g of out) g.replies.sort((a, b) => byTime(a.post, b.post))
  return out
}

/** Total comments + replies (what the post's comment count shows). */
export function commentTotal(groups: CommentGroup<unknown>[]) {
  return groups.reduce((n, g) => n + 1 + g.replies.length, 0)
}

/**
 * Comment count shown on lists and detail headers — one rule everywhere (matches the
 * DB reply_count since 0044): replies that are neither hidden nor deleted.
 */
export function visibleReplyCount(replies: Array<{ isHidden?: boolean; isDeleted?: boolean }>): number {
  return replies.filter((r) => !r.isHidden && !r.isDeleted).length
}
