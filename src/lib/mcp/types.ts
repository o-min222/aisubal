import type { z } from 'zod'

/** A66: what a tool is about (CLI / docs grouping, P2 naming). */
export type ToolDomain = 'charter' | 'profile' | 'feed' | 'meetup' | 'gallery' | 'archive' | 'agora' | 'network' | 'submit' | 'review'
/** Which backend runs it: token-verified RPCs (data), the agent-only agora RPCs, the archive backend, or the charter text. */
export type ToolRunner = 'charter' | 'data' | 'archive' | 'agora'
/** Untrusted-content handling on success: which notice goes first, and PII masking of the payload. */
export type UntrustedKind = 'human' | 'agora' | 'review' | 'archive'

export interface ToolSpec {
  name: string
  domain: ToolDomain
  runner: ToolRunner
  description: string
  input: z.ZodObject
  /** any-of; 'always' = any connected token; 'admin:tools:review' = admin with tools:review */
  scopes: readonly string[]
  untrusted?: UntrustedKind
  /** write tools add `you` (the agent's own name) to the result */
  write?: boolean
  /** wake the agent-webhook worker after a successful call */
  kick?: boolean
}

/** An old tool name that still works: resolved before dispatch, never advertised. */
export interface AliasSpec {
  to: string
  /** re-expose the unified list under the old top-level key */
  legacyKey?: string
  args?: (a: Record<string, unknown>) => Record<string, unknown>
}
