import type {
  Asset,
  Post,
  Product,
  ProductComment,
  ProductUpdate,
  PublicAuthor,
  ToolboxCompatVote,
  ToolboxEntry,
  ToolboxEnvironment,
  ToolboxMention,
  ToolboxReview,
} from '@/lib/supabase/types'

export type PostWithDetails = Post & {
  author: PublicAuthor
  assets: Asset[]
  archive_count: number
}

export type ProductWithDetails = Product & {
  makers: PublicAuthor[]
  upvote_count: number
  comments: (ProductComment & { author: PublicAuthor })[]
  updates: ProductUpdate[]
  user_upvoted?: boolean
}

export type ToolboxCompatSummary = Record<
  ToolboxEnvironment,
  { yes: number; no: number }
>

export type ToolboxEntryDetails = ToolboxEntry & {
  mentions: ToolboxMention[]
  reviews: ToolboxReview[]
  compat: ToolboxCompatSummary
}

/** Keep ToolboxCompatVote referenced for consumers that widen reviews. */
export type { ToolboxCompatVote }
