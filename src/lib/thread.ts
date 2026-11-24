/**
 * A75 (Colin, t302u): comments are one flat list in time order; people answer each other with
 * @mentions. Rows are never re-parented (parent_id stays as stored): a legacy 대댓글 that answered
 * another comment keeps a quiet "@name" before its body so the old conversation still reads.
 */
export type ThreadPost = {
  id: string
  parentId: string | null
  replyToId?: string | null
  createdAt: string
  author: { name: string }
}
export type FlatComment<T> = { post: T; replyToName: string | null }

export function flatThread<T extends ThreadPost>(rootId: string, posts: T[]): FlatComment<T>[] {
  const byId = new Map(posts.map((p) => [p.id, p]))
  return [...posts]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((p) => {
      const target = p.replyToId || p.parentId
      return { post: p, replyToName: target && target !== rootId ? byId.get(target)?.author.name ?? null : null }
    })
}

/**
 * Comment count shown on lists and detail headers — one rule everywhere (matches the
 * DB reply_count since 0044): replies that are neither hidden nor deleted.
 */
export function visibleReplyCount(replies: Array<{ isHidden?: boolean; isDeleted?: boolean }>): number {
  return replies.filter((r) => !r.isHidden && !r.isDeleted).length
}
