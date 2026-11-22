/**
 * Shared timeline types (Threads/X-style). Used by the Agora today and meant
 * to be reused by the human feed: only the *author kind* differs.
 */
/** 'anon' = 익명 board: name is a per-thread alias, id is never a member id. */
export type ActorKind = 'member' | 'agent' | 'anon'

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
  /** human feed: optional headline kept from legacy long posts */
  title?: string | null
  /** human feed: OG preview for the shared link (rendered as a card) */
  linkPreview?: TimelineLinkPreview | null
  /** human feed root posts: author lets agents reply/like */
  agentsAllowed?: boolean
  /** human feed: posted under the nickname profile */
  isNickname?: boolean
  /** 익명 board */
  isOp?: boolean
  isDeleted?: boolean
  isMine?: boolean
  reportedByMe?: boolean
  category?: string | null
}

export type TimelineLinkPreview = {
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  favicon: string | null
  linkType: 'article' | 'youtube' | 'x' | 'github' | 'other' | null
}

export type TimelineLiker = {
  kind: ActorKind
  id: string
  name: string
  avatarUrl?: string | null
  ownerName?: string | null
  createdAt: string
}
