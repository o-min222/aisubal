export type Member = {
  /** UI language preference (0019); read via get_my_member, set via member_set_locale */
  locale?: string | null
  /** color theme (0028): system | light | dark; set via member_set_theme */
  theme?: string | null
  /** composer's last agent-reaction choice (0082); set via member_set_agent_interaction */
  agent_interaction_default?: string | null
  /** A43 (0095): the composer's last 공유범위 */
  post_visibility_default?: string | null
  id: string
  auth_id: string
  email: string // private — only from get_my_member() for the owner; never shown to others
  /** Self-made public name (NOT the Google name — that lives in member_private). */
  display_name: string
  /** Unique @handle; mentions and 모임 attendee lists use it. */
  handle?: string | null
  bio: string | null
  avatar_url: string | null
  /** Real name is opt-in: shown on the profile only when show_real_name is true. */
  show_real_name?: boolean
  public_real_name?: string | null
  profile_completed_at?: string | null
  /** A54 (0104): the first-question mission; null = not yet (undefined = unknown, never gate on it) */
  first_mission_at?: string | null
  /** Owner-only private prefill (get_my_member). Never render publicly. */
  private_real_name?: string | null
  private_google_avatar_url?: string | null
  // Optional nickname profile (one per member, after community unlock)
  nickname: string | null
  nickname_bio: string | null
  nickname_avatar_url: string | null
  nickname_created_at: string | null
  /** 0052: the signed-in member's own nickname_profiles.id (only on their own row) */
  nickname_id?: string | null
  is_admin: boolean
  is_banned: boolean
  banned_at: string | null
  /** Only on your own row (get_my_member) or admin RPCs; members can't read others'. */
  banned_reason?: string | null
  invited_by_id: string | null
  invite_code_used: string | null
  signup_completed_at: string | null
  created_at: string
  updated_at: string
}

/** Author shown publicly on a post — never mixes real/nickname identities */
export type PublicAuthor =
  | {
      kind: 'real'
      id: string // member id OK for real-name posts
      display_name: string
      bio: string | null
      avatar_url: string | null
    }
  | {
      kind: 'nickname'
      id: string // opaque nickname profile id (NOT member id)
      nickname: string
      bio: string | null
      avatar_url: string | null
    }

export type PostAs = 'real' | 'nickname'

export type WaitlistEntry = {
  id: string
  auth_id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export type InviteCode = {
  id: string
  code: string
  created_by_id: string
  used_by_id: string | null
  used_at: string | null
  note: string | null
  created_at: string
}

export type LinkType = 'article' | 'youtube' | 'x' | 'github' | 'other'

export type LinkPreview = {
  url: string
  title: string | null
  description: string | null
  image: string | null
  site_name: string | null
  favicon: string | null
  link_type: LinkType
}

export type Post = {
  id: string
  title: string
  content: string
  source_note: string | null
  url: string | null
  link_title: string | null
  link_description: string | null
  link_image: string | null
  link_site_name: string | null
  link_favicon: string | null
  link_type: LinkType | null
  link_previews?: LinkPreview[] | null
  author_id: string // always set for admin moderation
  posted_as: PostAs
  /** write-only: not readable by members (0036) */
  nickname_profile_id?: string | null // set when posted_as=nickname
  is_hidden: boolean
  is_agent_posted: boolean
  /** not readable by members (0036) */
  agent_token_name?: string | null
  created_at: string
  updated_at: string
  // 0004 timeline columns (optional so legacy fixtures stay valid)
  parent_id?: string | null
  root_id?: string | null
  like_count?: number
  reply_count?: number
  agent_interaction?: AgentInteraction
  author_kind?: 'member' | 'agent'
  agent_name?: string | null
  agent_model?: string | null
}

/** Per-post setting chosen by the human author. */
export type AgentInteraction = 'humans_only' | 'agents_allowed'

export type AssetType = 'SKILL_MD' | 'MCP_CONFIG' | 'CURSOR_RULES' | 'PROMPT' | 'NOTE'

export type Asset = {
  id: string
  post_id: string
  type: AssetType
  name: string
  content: string
  filename: string | null
  created_at: string
  updated_at: string
}

export type ArchiveFolder = {
  id: string
  owner_id: string
  name: string
  created_at: string
}

/** Legacy post-only archive row (kept for older code paths) */
export type ArchiveItem = {
  id: string
  owner_id: string
  post_id: string
  folder_id: string | null
  note: string | null
  tags: string | null
  created_at: string
}

export type ApiToken = {
  id: string
  member_id: string
  name: string
  token_hash: string
  token_prefix: string
  scopes: string
  last_used_at: string | null
  expires_at: string | null
  is_revoked: boolean
  created_at: string
}

export type Report = {
  id: string
  post_id: string
  reporter_id: string
  reason: string
  status: 'pending' | 'resolved' | 'dismissed'
  resolved_by_id: string | null
  resolved_at: string | null
  created_at: string
}

export type SiteSettings = {
  anon_unlock_threshold: number
  site_name: string
  invites_per_member: number
}

export type MeetupMode = 'offline' | 'online'
export type MeetupRsvpStatus = 'pending' | 'confirmed' | 'waitlisted' | 'rejected' | 'cancelled'
export type MeetupStatus = 'open' | 'closed' | 'cancelled' | 'past'

export type Meetup = {
  id: string
  title: string
  description: string
  mode: MeetupMode
  venue_name: string | null
  group_id: string | null
  members_only: boolean
  questions: Array<{ id: string; label: string; required: boolean }>
  starts_at: string // ISO, interpret as KST display
  ends_at: string | null
  capacity: number
  apply_deadline: string | null
  requires_approval: boolean
  fee_note: string | null
  host_id: string
  posted_as: PostAs
  nickname_profile_id: string | null
  status: MeetupStatus
  cancelled_at: string | null
  recap_post_id: string | null
  recap_photos: string[] | null
  created_at: string
  updated_at: string
}

export type MeetupRsvp = {
  id: string
  meetup_id: string
  member_id: string
  posted_as: PostAs
  nickname_profile_id: string | null
  status: MeetupRsvpStatus
  note: string | null
  created_at: string
  updated_at: string
}

export type MeetupAnnouncement = {
  id: string
  meetup_id: string
  body: string
  created_at: string
}

export type Product = {
  id: string
  name: string
  tagline: string
  description: string
  logo_url: string | null
  screenshots: string[]
  website_url: string | null
  app_store_url: string | null
  github_url: string | null
  tags: string[]
  maker_ids: string[]
  launch_post_id: string | null
  featured: boolean
  created_at: string
  updated_at: string
  launched_at: string
}

export type ProductUpvote = {
  id: string
  product_id: string
  member_id: string
  created_at: string
}

export type ProductComment = {
  id: string
  product_id: string
  member_id: string
  posted_as: PostAs
  nickname_profile_id: string | null
  body: string
  created_at: string
}

export type ProductUpdate = {
  id: string
  product_id: string
  title: string
  body: string
  created_at: string
}

export type ToolboxType =
  | 'agent_skill'
  | 'mcp_server'
  | 'cursor_rules'
  | 'prompt'
  | 'cli_tool'
  | 'saas_service'
  /** former 런치: a member's own service with product extras (upvotes, makers, updates). Category 서비스. */
  | 'product'

export type ToolboxEnvironment =
  | 'claude_code'
  | 'claude_desktop'
  | 'cursor'
  | 'codex_cli'
  | 'chatgpt'
  | 'gemini_cli'

export type ToolboxEntry = {
  id: string
  name: string
  slug: string
  one_liner: string
  description: string
  type: ToolboxType
  tags: string[] // use-case tags
  icon_url: string | null
  canonical_url: string // dedupe key
  github_url: string | null
  homepage_url: string | null
  license: string | null
  last_commit_at: string | null
  source_repo: string | null // owner/repo
  install_snippets: Partial<Record<ToolboxEnvironment | 'generic', string>>
  /** commands render only when a reviewer confirmed them (0033); otherwise show the official link */
  install_verified?: boolean
  mention_count: number
  install_count: number
  avg_rating: number // 0-5
  rating_count: number
  created_by_id: string | null
  featured: boolean
  created_at: string
  updated_at: string
  // 0006 unified tools
  product_id?: string | null
  launched_at?: string | null
  user_count?: number
  /** 0100: one-tap 좋아요 total */
  like_count?: number
  upvote_count?: number
  ai_rating_avg?: number
  ai_rating_count?: number
  // 0031 gallery: kind is derived from type; maker_ids/is_own drive the 제작자 badge
  kind?: 'tool' | 'service'
  maker_ids?: string[]
  is_own?: boolean
}

export type ToolboxMention = {
  id: string
  entry_id: string
  post_id: string
  url: string
  created_at: string
}

export type ToolboxReview = {
  id: string
  entry_id: string
  member_id: string
  rating: number // 1-5
  body: string
  created_at: string
  updated_at: string
}

export type ToolboxCompatVote = {
  id: string
  entry_id: string
  member_id: string
  environment: ToolboxEnvironment
  works: boolean
  created_at: string
}

export type TokenScope =
  | 'archive:read'
  | 'archive:write'
  /** legacy names, still honored by the DB */
  | 'archive_read'
  | 'archive_write'
  | 'posts_read'
  | 'meetups_read'
  | 'meetups_write'
  | 'products_read'
  | 'products_write'
  | 'toolbox_read'
  | 'toolbox_write'
  | 'agora:read'
  | 'agora:write'
  | 'feed:interact'
  | 'tools:submit'
  | 'tools:review'

export type UserState =
  | { type: 'unauthenticated' }
  | { type: 'waitlist'; entry: WaitlistEntry }
  | { type: 'member'; member: Member }
