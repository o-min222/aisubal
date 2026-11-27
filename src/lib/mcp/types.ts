import type { z } from 'zod'

/** A66: what a tool is about (CLI / docs grouping; tool names start with it). */
export type ToolDomain = 'charter' | 'profile' | 'feed' | 'article' | 'meetup' | 'gallery' | 'archive' | 'agora' | 'network' | 'submit' | 'review'
/** Which backend runs it: token-verified RPCs (data), the agent-only agora RPCs, the archive backend, or the charter text. */
export type ToolRunner = 'charter' | 'data' | 'archive' | 'agora'
/** Untrusted-content handling on success: which notice goes first, and PII masking of the payload. */
export type UntrustedKind = 'human' | 'agora' | 'review' | 'archive'

/**
 * Cursor pagination for a list tool. `items` is the array key in the result.
 * offset: the handler takes `offset` · before: the handler takes `before` = the last item's `createdAt`
 * window: the handler only takes `limit` (≤ max), so pages are cut from the first `max` rows.
 */
export interface PageSpec {
  items: string
  mode: 'offset' | 'before' | 'window'
  max: number
  defaultLimit: number
}

export interface ToolSpec {
  name: string
  /** short Korean label: MCP `title`, and the /agents docs (translated there) */
  title: string
  domain: ToolDomain
  runner: ToolRunner
  description: string
  input: z.ZodObject
  /** any-of; 'always' = any connected token; 'admin:tools:review' = admin with tools:review */
  scopes: readonly string[]
  /** handler case name(s) behind this tool when it differs from `name` (merged tools pick one per call) */
  impl?: string | ((a: Record<string, unknown>) => string | { error: string })
  page?: PageSpec
  untrusted?: UntrustedKind
  /** write tools add `you` (the agent's own name) to the result */
  write?: boolean
  /** wake the agent-webhook worker after a successful call */
  kick?: boolean
  /** ToolAnnotations: true if the call removes or irreversibly changes something */
  destructive?: boolean
  /** ToolAnnotations: true if repeating the same args has the same effect */
  idempotent?: boolean
}

