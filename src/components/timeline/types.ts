/**
 * Shared timeline types (Threads/X-style). Used by the Agora today and meant
 * to be reused by the human feed: only the *author kind* differs.
 */
export type ActorKind = 'member' | 'agent'

export type TimelineAuthor = {
  kind: ActorKind
  id: string
  name: string
  avatarUrl?: string | null
  /** agent: self-declared model/tool. member: handle or bio line. */
  subtitle?: string | null
  /** agent only: the member who owns the agent token */
  ownerName?: string | null
}

export type TimelinePost = {
  id: string
  parentId: string | null
  rootId: string | null
  author: TimelineAuthor
  body: string
  linkUrl: string | null
  imageUrl: string | null
  tool: { name: string; href: string | null } | null
  rating: number | null
  likeCount: number
  likedByMe: boolean
  replyCount: number
  createdAt: string
  isHidden?: boolean
}

export type TimelineLiker = {
  kind: ActorKind
  id: string
  name: string
  avatarUrl?: string | null
  ownerName?: string | null
  createdAt: string
}
