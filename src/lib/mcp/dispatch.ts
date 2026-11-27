import { maskPiiDeep } from '@/lib/pii'
import { agentCharterText } from '@/lib/pledge'
import { getMember, isDevMode } from '@/lib/auth'
import { createAnonClient } from '@/lib/supabase/anon'
import { UNTRUSTED_NOTICE } from '@/lib/agora-rules'
import { handleAgoraTool } from '@/lib/agora-mcp'
import { handleArchiveTool, rpcArchiveBackend, type ArchiveBackend } from '@/lib/archive-mcp'
import { devArchiveBackend } from '@/lib/data/archive'
import { HUMAN_UNTRUSTED_NOTICE, handleDataTool } from '@/lib/mcp-data'
import { REVIEW_UNTRUSTED_NOTICE } from '@/lib/tool-review'
import { cleanProfileText, selfIntro } from '@/lib/agent-self'
import { omitHiddenDeep } from '@/lib/mcp-omit'
import { parseAgentProfile } from '@/lib/agent-profile'
import { kickWebhookWorker } from '@/lib/agent-webhooks'
import { parseAgentCaps, type AgentCaps } from '@/lib/agent-conduct'
import { getAgentCaps } from '@/lib/data/agent-caps'
import { handleDevTool } from './dev-tools'
import { LIST_OPTIONS, implName, isAdminTool, resolveTool, unknownToolMessage, type PageSpec, type ToolSpec } from './registry'

export type ToolFilter = { scopes: readonly string[]; isAdmin: boolean }

export type McpText = { type: 'text'; text: string }
export type ToolResult = { content: McpText[]; structuredContent?: Record<string, unknown>; isError?: boolean; _meta?: Record<string, unknown> }
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

/** Per-request context: the bearer token and lazily fetched facts about its agent. */
export class McpContext {
  readonly dev = isDevMode()
  private selfMemo: Promise<ReturnType<typeof parseAgentProfile>> | null = null
  private archiveMemo: Promise<ArchiveBackend | null> | null = null
  private capsMemo: Promise<AgentCaps> | null = null
  private filterMemo: Promise<ToolFilter | undefined> | null = null
  constructor(readonly bearer: string | null, readonly origin: string) {}

  readonly rpc: Rpc = async (fn, args) => {
    const { data, error } = await createAnonClient().rpc(fn, args)
    return { data, error: error ? { message: error.message } : null }
  }

  /** who this token's agent is (name, bio, owner); one RPC per request at most */
  self() {
    return (this.selfMemo ??=
      this.bearer && !this.dev
        ? Promise.resolve(createAnonClient().rpc('mcp_agent_profile_get', { p_token: this.bearer }))
            .then(({ data }) => parseAgentProfile(data))
            .catch(() => null)
        : Promise.resolve(null))
  }

  /** A80: live agent reaction caps (site settings, 0124 agent_caps) for prompts; defaults on error */
  caps() {
    return (this.capsMemo ??= this.dev ? getAgentCaps() : this.rpc('agent_caps', {}).then(({ data, error }) => parseAgentCaps(error ? null : data)).catch(() => parseAgentCaps(null)))
  }

  /**
   * Which tools this token may see and call (tools/list, resources, admin-tool calls). undefined = everything
   * (dev server). A81: admin tools are visible only to admin owners whose token has tools:review.
   */
  filter() {
    return (this.filterMemo ??= this.dev
      ? Promise.resolve(undefined)
      : Promise.resolve(createAnonClient().rpc('mcp_token_scopes', { p_token: this.bearer }))
          .then(({ data: info }) => ({
            scopes: Array.isArray((info as { scopes?: unknown } | null)?.scopes) ? (info as { scopes: string[] }).scopes : [],
            isAdmin: (info as { admin?: unknown } | null)?.admin === true,
          }))
          .catch(() => ({ scopes: [] as string[], isAdmin: false })))
  }

  /** A81: may this token see an admin tool? (member tools: always "visible"; their RPC checks the scope) */
  async seesAdminTools() {
    const f = await this.filter()
    return !f || (f.isAdmin && f.scopes.includes('tools:review'))
  }

  archive() {
    return (this.archiveMemo ??= (async () => {
      if (!this.dev) return this.bearer ? rpcArchiveBackend(this.bearer, this.rpc) : null
      const m = await getMember()
      return m ? devArchiveBackend(m) : null
    })())
  }
}

const NOTICE: Record<NonNullable<ToolSpec['untrusted']>, (r: Record<string, unknown>) => string> = {
  human: () => HUMAN_UNTRUSTED_NOTICE,
  agora: () => UNTRUSTED_NOTICE,
  review: () => REVIEW_UNTRUSTED_NOTICE,
  archive: (r) => String(r.notice ?? ''),
}

// A66 P2: minified JSON (whitespace only; every client parses it the same) — fewer tokens per call
const json = (v: unknown): McpText => ({ type: 'text', text: JSON.stringify(v) })
const isFailure = (r: Record<string, unknown>) => 'error' in r

/** Shape a handler's result the way every client has always received it. */
function toContent(spec: ToolSpec, result: Record<string, unknown>): ToolResult {
  const failed = isFailure(result)
  if (failed || !spec.untrusted) {
    return { content: [json(result)], structuredContent: result, ...(failed ? { isError: true } : {}) }
  }
  const notice = NOTICE[spec.untrusted](result)
  const payload = maskPiiDeep(result) as Record<string, unknown>
  return { content: [...(notice ? [{ type: 'text' as const, text: notice }] : []), json(payload)], structuredContent: payload }
}

export type CallOutcome = {
  result: ToolResult
  tool: string
  status: 'ok' | 'error' | 'refused' | 'unknown' | 'unauthorized'
  /** args did not match the schema (the call still ran: validation is lenient so older agents keep working) */
  invalid?: boolean
}

// ---------------------------------------------------------------------------- list options (A66 P2)
type Cursor = { t: string; o?: number; b?: string }
const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url')
function decodeCursor(raw: unknown, tool: string): Cursor | null | 'bad' {
  if (raw == null || raw === '') return null
  try {
    const c = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8')) as Cursor
    return c && c.t === tool && (Number.isInteger(c.o) || typeof c.b === 'string') ? c : 'bad'
  } catch {
    return 'bad'
  }
}

type Paging = { page: PageSpec; limit: number; offset: number; fields: string[] | null; compact: boolean }

/** Pull cursor / fields / compact out of the args and turn the cursor into what the handler takes. */
function prepareList(spec: ToolSpec, args: Record<string, unknown>): { args: Record<string, unknown>; paging: Paging | null } | { error: string } {
  const { cursor, fields, compact, ...rest } = args
  const f = Array.isArray(fields) ? fields.filter((x): x is string => typeof x === 'string') : null
  if (!spec.page) return { args: rest, paging: null }
  const page = spec.page
  const limit = Math.min(Math.max(Math.trunc(Number(rest.limit)) || page.defaultLimit, 1), page.max)
  const c = decodeCursor(cursor, spec.name)
  if (c === 'bad') return { error: 'Invalid cursor: pass nextCursor from the previous page of the same tool.' }
  let offset = 0
  if (page.mode === 'before') {
    if (c?.b) rest.before = c.b
  } else {
    offset = c?.o ?? (page.mode === 'offset' ? Math.max(0, Math.trunc(Number(rest.offset)) || 0) : 0)
    if (page.mode === 'offset') rest.offset = offset
    if (page.mode === 'window' && offset >= page.max) return { error: `This list stops at ${page.max} items: narrow it (query / filters) instead of paging further.` }
  }
  rest.limit = page.mode === 'window' ? Math.min(offset + limit, page.max) : limit
  return { args: rest, paging: { page, limit, offset, fields: f && f.length ? f : null, compact: compact === true } }
}

const isEmpty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)
function dropEmpty(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropEmpty)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) {
      const y = dropEmpty(x)
      if (!isEmpty(y)) out[k] = y
    }
    return out
  }
  return v
}

/** Cut the page, add nextCursor, keep only `fields`, drop empties when compact. */
function finishList(spec: ToolSpec, result: Record<string, unknown>, p: Paging | null, compactAny: boolean): Record<string, unknown> {
  let out = result
  if (p && Array.isArray(result[p.page.items])) {
    let items = result[p.page.items] as Array<Record<string, unknown>>
    const fetched = items.length
    let next: Cursor | null = null
    if (p.page.mode === 'window') {
      items = items.slice(p.offset, p.offset + p.limit)
      const end = p.offset + p.limit
      if (fetched >= end && end < p.page.max) next = { t: spec.name, o: end }
    } else if (p.page.mode === 'offset') {
      const total = typeof result.total === 'number' ? result.total : null
      const end = p.offset + items.length
      if (total != null ? end < total : items.length === p.limit) next = { t: spec.name, o: end }
    } else {
      const last = items[items.length - 1]
      if (items.length === p.limit && typeof last?.createdAt === 'string') next = { t: spec.name, b: last.createdAt }
    }
    if (p.fields) {
      const keep = p.fields
      items = items.map((it) => (it && typeof it === 'object' ? Object.fromEntries(keep.filter((k) => k in it).map((k) => [k, it[k]])) : it))
    }
    out = { ...result, [p.page.items]: items, nextCursor: next ? encodeCursor(next) : null }
  }
  return compactAny ? (dropEmpty(out) as Record<string, unknown>) : out
}

/** tools/call: resolve refusals / unknown names, run the tool's backend, wrap the result. */
export async function callTool(ctx: McpContext, rawName: string, rawArgs: Record<string, unknown> = {}): Promise<CallOutcome> {
  const r = resolveTool(rawName, rawArgs)
  if (r.kind === 'refused') { const payload = { error: r.message, refused: true, humanOnly: true }; return { tool: rawName, status: 'refused', result: { content: [json(payload)], structuredContent: payload, isError: true } } }
  const unknown = (hideAdmin: boolean): CallOutcome => { const payload = { error: unknownToolMessage(rawName, { hideAdmin }) }; return { tool: rawName, status: 'unknown', result: { content: [json(payload)], structuredContent: payload, isError: true } } }
  if (r.kind === 'unknown') return unknown(!(await ctx.seesAdminTools()))
  const { spec } = r
  // A81: to a member, an admin tool does not exist (same answer as any unknown name)
  if (isAdminTool(spec) && !(await ctx.seesAdminTools())) return unknown(true)
  const fail = (error: string): CallOutcome => ({ tool: spec.name, status: 'error', result: { content: [json({ error })], structuredContent: { error }, isError: true } })

  const invalid = !(spec.page ? spec.input.extend(LIST_OPTIONS) : spec.input).safeParse(r.args).success
  const prepared = prepareList(spec, r.args)
  if ('error' in prepared) return fail(prepared.error)
  const { args, paging } = prepared
  const compact = r.args.compact === true
  const impl = implName(spec, args)
  if (typeof impl !== 'string') return fail(impl.error)

  if (spec.runner === 'charter') {
    const me = await ctx.self()
    return { tool: spec.name, status: 'ok', result: { content: [...(me ? [{ type: 'text' as const, text: `whoami\n${selfIntro(me)}` }] : []), { type: 'text', text: agentCharterText() }] } }
  }

  let result: Record<string, unknown>
  if (spec.runner === 'agora') {
    result = await handleAgoraTool(impl, args, ctx.bearer, ctx.rpc)
  } else if (spec.runner === 'archive') {
    const backend = await ctx.archive()
    if (!backend) return { tool: spec.name, status: 'unauthorized', result: { content: [json({ error: 'Unauthorized' })], structuredContent: { error: 'Unauthorized' }, isError: true } }
    result = await handleArchiveTool(impl, args, backend, ctx.origin)
  } else {
    // production: every data tool goes through token-verified SECURITY DEFINER RPCs; the dev server mocks
    // all but the feed / profile tools (those have dev paths inside handleDataTool)
    const viaRpc = !ctx.dev || impl.startsWith('feed_') || impl.startsWith('article_') || spec.domain === 'profile'
    result = omitHiddenDeep(viaRpc ? await handleDataTool(impl, args, ctx.bearer, ctx.rpc, ctx.origin) : await handleDevTool(impl, args))
  }

  const failed = isFailure(result)
  if (!failed) result = finishList(spec, result, paging, compact)
  if (spec.write && !failed) {
    const me = await ctx.self()
    if (me) result = { ...result, you: cleanProfileText(me.name, 40) }
  }
  if (spec.kick && !failed) kickWebhookWorker()
  const content = toContent(spec, result)
  return { tool: spec.name, status: failed ? 'error' : 'ok', invalid, result: content }
}
