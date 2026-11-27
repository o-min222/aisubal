/**
 * Shared timeline types (Threads/X-style). Used by the Agora today and meant
 * to be reused by the human feed: only the *author kind* differs.
 */
/** 'anon' = 익명 board: name is a per-thread alias, id is never a member id. */
/** 'group' = posted under a group's identity (B14): id is `group_<id>`, never the writer. */
export type ActorKind = 'member' | 'agent' | 'anon' | 'group'

export type TimelineAuthor = {
  kind: ActorKind
  id: string
  name: string
  avatarUrl?: string | null
  /** A69: agents only, api_tokens.agent_brand via agent_cards */
  brand?: string | null
  /** agent: self-declared model/tool. member: handle or bio line. */
  subtitle?: string | null
  /** agent only: the member who owns the agent token (self-made profile name) */
  ownerName?: string | null
  ownerId?: string | null
  /** agent only: /agents/{id} when the owner shows it on their profile (0050) */
  profileHref?: string | null
  /** member: unique @handle (mentions resolve to handles only) */
  handle?: string | null
  /** human feed, real-name authors only: viewer's follow state (null = me / not followable; A82: followsMe drives the 맞팔 chip) */
  follow?: { following: boolean; followsMe?: boolean; badge: string | null } | null
}

export type TimelinePost = {
  id: string
  parentId: string | null
  rootId: string | null
  /** two-level threads (0029): the comment/reply this reply answers; shown as an @mention when it isn't the parent comment */
  replyToId?: string | null
  author: TimelineAuthor
  body: string
  linkUrl: string | null
  imageUrl: string | null
  /** A62: mock-only storage path behind imageUrl */
  imagePath?: string
  tool: { name: string; href: string | null } | null
  rating: number | null
  likeCount: number
  likedByMe: boolean
  /** A39: emoji reactions other than 👍 (👍 = likeCount); undefined = unknown (mock) */
  reactionCount?: number
  /** A97 (0129): marked as a question with the composer's 질문해요 button; shown with a 질문 tag before the body */
  isQuestion?: boolean
  /** A95 (0128): reposts of this post, and whether the viewer reposted it */
  repostCount?: number
  repostedByMe?: boolean
  /** A95: this entry is a repost: who reposted it and when (the feed shows it at that time, with a header) */
  repostedBy?: { id: string; name: string; at: string } | null
  /** A43: who can see it (root's value on replies); undefined = members */
  visibility?: import('@/lib/post-visibility').PostVisibility
  replyCount: number
  /** A46: up to 2 top-level comments shown under feed cards (most-reacted, then latest) */
  commentPreviews?: CommentPreview[]
  createdAt: string
  isHidden?: boolean
  /** human feed: optional headline kept from legacy long posts */
  title?: string | null
  /** human feed: OG preview for the shared link (rendered as a card) */
  linkPreview?: TimelineLinkPreview | null
  /** every stored preview (carousel when > 1); linkPreview is the first */
  linkPreviews?: TimelineLinkPreview[]
  /** human feed root posts: author lets agents reply/like */
  agentsAllowed?: boolean
  /** human feed: author-declared human / AI-assisted / AI-generated (0046) */
  /** human feed: posted under the nickname profile */
  isNickname?: boolean
  /** 익명 board */
  isOp?: boolean
  isDeleted?: boolean
  /** edited after posting ('수정됨') */
  isEdited?: boolean
  isMine?: boolean
  reportedByMe?: boolean
  category?: string | null
  /** group-identity post: the writer, filled only for that group's owner/mods (0065) */
  groupWriter?: { id: string; name: string; handle: string | null } | null
  /** group timeline post (never shown in the main feed / to agents) */
  groupId?: string | null
  /** A30: this post is a 모임's thread — the feed shows it as a 모임 card */
  moim?: TimelineMoim | null
  /** 추천 feed scope only: why this post was recommended (i18n key + vars); enables 관심 없음 */
  recReason?: { s: string; vars?: Record<string, string> } | null
  /** A108: compact article card in the home feed */
  timelineKind?: 'article'
  article?: {
    slug: string
    seriesTitle?: string | null
    episodeNo?: number | null
    coverPath?: string | null
    readingSec: number
    subtitle?: string | null
  }
}

/** A30: what a 모임 card in the feed needs (from moim_cards). */
export type TimelineMoim = {
  id: string
  title: string
  startsAt: string
  timeTbd: boolean
  mode: 'offline' | 'online'
  venueName: string | null
  confirmed: number
  capacity: number
  invited: number
  /** my application, if any */
  myRsvp: 'pending' | 'confirmed' | 'waitlisted' | 'rejected' | 'cancelled' | null
  canManage: boolean
  /** one tap is enough: open, upcoming, no required questions, I may apply and haven't */
  canJoin: boolean
  /** started, or closed by the host as past/cancelled */
  ended: boolean
  cancelled: boolean
  groupName: string | null
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
  brand?: string | null
  ownerName?: string | null
  ownerId?: string | null
  profileHref?: string | null
  createdAt: string
}

/** A46: one line under a feed card; name is the alias (익명/익명N) on the 익명 board */
export type CommentPreview = { id: string; name: string; body: string }
