/**
 * Feed comments: Threads-style two-level nest (A118). The DB already stores
 * parent_id / root_id / reply_to_id / thread_depth (0029); this just groups
 * them for the UI. Deeper replies stay one indent under the first-level
 * comment. Agora and 익명 still use the flat list (A75).
 */
export type ThreadPost = {
  id: string
  parentId: string | null
  replyToId?: string | null
  createdAt: string
  author: { name: string; handle?: string | null }
}

export type FlatComment<T> = { post: T; replyToName: string | null }

export type NestedComment<T> = {
  post: T
  replyToName: string | null
  children: { post: T; replyToName: string | null }[]
}

/** How many nested replies show before "답글 N개 더 보기". */
export const NESTED_PREVIEW = 3

export function flatThread<T extends ThreadPost>(rootId: string, posts: T[]): FlatComment<T>[] {
  const byId = new Map(posts.map((p) => [p.id, p]))
  return [...posts]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((p) => {
      const target = p.replyToId || p.parentId
      return { post: p, replyToName: target && target !== rootId ? byId.get(target)?.author.name ?? null : null }
    })
}

function firstLevelId<T extends ThreadPost>(rootId: string, byId: Map<string, T>, p: T): string | null {
  if (!p.parentId || p.parentId === rootId) return null
  let cur: T = p
  for (let i = 0; i < 8 && cur.parentId && cur.parentId !== rootId; i++) {
    const parent = byId.get(cur.parentId)
    if (!parent) return null // parent gone: show as a top-level row
    if (!parent.parentId || parent.parentId === rootId) return cur.parentId
    cur = parent
  }
  return null
}

/** Group replies: first-level comments, then one indent of children (oldest first). */
export function nestThread<T extends ThreadPost>(rootId: string, posts: T[]): NestedComment<T>[] {
  const byId = new Map(posts.map((p) => [p.id, p]))
  const nameOf = (id: string | null | undefined) =>
    id && id !== rootId ? byId.get(id)?.author.name ?? null : null

  const tops: T[] = []
  const childrenBy = new Map<string, T[]>()
  for (const p of posts) {
    const under = firstLevelId(rootId, byId, p)
    if (!under) {
      tops.push(p)
      continue
    }
    const list = childrenBy.get(under)
    if (list) list.push(p)
    else childrenBy.set(under, [p])
  }
  tops.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return tops.map((post) => ({
    post,
    replyToName: null,
    children: (childrenBy.get(post.id) ?? [])
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => {
        const target = c.replyToId && c.replyToId !== post.id ? c.replyToId : null
        return { post: c, replyToName: nameOf(target) }
      }),
  }))
}

/**
 * Mirror of thread__two_level (0029): a reply to a reply is stored under the
 * first-level comment and remembers who it answered in replyToId.
 */
export function normalizeReplyTarget(parent: { id: string; parentId: string | null; rootId?: string | null } | null | undefined): {
  parentId: string
  rootId: string
  replyToId: string | null
} | null {
  if (!parent) return null
  const rootId = parent.rootId ?? (!parent.parentId ? parent.id : parent.parentId)
  if (!parent.parentId) return { parentId: parent.id, rootId: parent.id, replyToId: null }
  if (parent.parentId === rootId) return { parentId: parent.id, rootId, replyToId: parent.id }
  return { parentId: parent.parentId, rootId, replyToId: parent.id }
}

/** Prefill @handle only when answering a nested reply (deeper than one indent). */
export function replyMentionPrefill(target: { parentId: string | null; author: { handle?: string | null } }, rootId: string): string {
  if (!target.parentId || target.parentId === rootId) return ''
  const h = target.author.handle?.replace(/^@/, '').trim()
  return h ? `@${h} ` : ''
}

/**
 * Comment count shown on lists and detail headers — one rule everywhere (matches the
 * DB reply_count since 0044): replies that are neither hidden nor deleted.
 */
export function visibleReplyCount(replies: Array<{ isHidden?: boolean; isDeleted?: boolean }>): number {
  return replies.filter((r) => !r.isHidden && !r.isDeleted).length
}
