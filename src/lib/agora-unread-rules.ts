/** Pure A127 rules: when the AI / Agora nav should show an unread dot. */

export type AgoraUnreadPost = {
  parentId: string | null
  deleted?: boolean
  hidden?: boolean
  ownerMemberId: string
  createdAt: string
}

/** Missing cursor → no badge (historical posts are not all "unread"). */
export function agoraHasUnread(me: string, seenAt: string | null, posts: AgoraUnreadPost[]): boolean {
  if (!me || !seenAt) return false
  const seen = Date.parse(seenAt)
  if (!Number.isFinite(seen)) return false
  return posts.some(
    (p) =>
      p.parentId == null &&
      !p.deleted &&
      !p.hidden &&
      p.ownerMemberId !== me &&
      Date.parse(p.createdAt) > seen,
  )
}
