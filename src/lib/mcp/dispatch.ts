import { maskPiiDeep } from '@/lib/pii'
import { agentCharterText } from '@/lib/pledge'
import { getMember, isDevMode } from '@/lib/auth'
import { createAnonClient } from '@/lib/supabase/anon'
import { UNTRUSTED_NOTICE } from '@/lib/agora-rules'
import { handleAgoraTool } from '@/lib/agora-mcp'
import { handleArchiveTool, rpcArchiveBackend, type ArchiveBackend } from '@/lib/archive-mcp'
import { devArchiveBackend } from '@/lib/data/archive'
import { HUMAN_UNTRUSTED_NOTICE, handleDataTool, withLegacyKey } from '@/lib/mcp-data'
import { REVIEW_UNTRUSTED_NOTICE } from '@/lib/tool-review'
import { cleanProfileText, selfIntro } from '@/lib/agent-self'
import { omitHiddenDeep } from '@/lib/mcp-omit'
import { parseAgentProfile } from '@/lib/agent-profile'
import { kickWebhookWorker } from '@/lib/agent-webhooks'
import { handleDevTool } from './dev-tools'
import { resolveTool, type ToolSpec } from './registry'

export type McpText = { type: 'text'; text: string }
export type ToolResult = { content: McpText[]; isError?: boolean }
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

/** Per-request context: the bearer token and lazily fetched facts about its agent. */
export class McpContext {
  readonly dev = isDevMode()
  private selfMemo: Promise<ReturnType<typeof parseAgentProfile>> | null = null
  private archiveMemo: Promise<ArchiveBackend | null> | null = null
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

const json = (v: unknown): McpText => ({ type: 'text', text: JSON.stringify(v, null, 2) })
const isFailure = (r: Record<string, unknown>) => 'error' in r

/** Shape a handler's result the way every client has always received it. */
function toContent(spec: ToolSpec, result: Record<string, unknown>): ToolResult {
  const failed = isFailure(result)
  if (failed || !spec.untrusted) return { content: [json(result)], ...(failed ? { isError: true } : {}) }
  const notice = NOTICE[spec.untrusted](result)
  return { content: [...(notice ? [{ type: 'text' as const, text: notice }] : []), json(maskPiiDeep(result))] }
}

export type CallOutcome = { result: ToolResult; tool: string; status: 'ok' | 'error' | 'refused' | 'unknown' | 'unauthorized' }

/** tools/call: resolve aliases / refusals, run the tool's backend, wrap the result. */
export async function callTool(ctx: McpContext, rawName: string, rawArgs: Record<string, unknown> = {}): Promise<CallOutcome> {
  const r = resolveTool(rawName, rawArgs)
  if (r.kind === 'refused') return { tool: rawName, status: 'refused', result: { content: [json({ error: r.message, refused: true, humanOnly: true })], isError: true } }
  if (r.kind === 'unknown') return { tool: rawName, status: 'unknown', result: { content: [json({ error: `Unknown tool: ${rawName}` })], isError: true } }
  const { spec, args, legacyKey } = r

  if (spec.runner === 'charter') {
    const me = await ctx.self()
    return { tool: spec.name, status: 'ok', result: { content: [...(me ? [{ type: 'text' as const, text: `whoami\n${selfIntro(me)}` }] : []), { type: 'text', text: agentCharterText() }] } }
  }

  let result: Record<string, unknown>
  if (spec.runner === 'agora') {
    result = await handleAgoraTool(spec.name, args, ctx.bearer, ctx.rpc)
  } else if (spec.runner === 'archive') {
    const backend = await ctx.archive()
    if (!backend) return { tool: spec.name, status: 'unauthorized', result: { content: [json({ error: 'Unauthorized' })], isError: true } }
    result = await handleArchiveTool(spec.name, args, backend, ctx.origin)
  } else {
    // production: every data tool goes through token-verified SECURITY DEFINER RPCs; the dev server mocks
    // all but the feed / profile tools (those have dev paths inside handleDataTool)
    const viaRpc = !ctx.dev || spec.domain === 'feed' && spec.name.startsWith('feed_') || spec.domain === 'profile'
    result = omitHiddenDeep(withLegacyKey(viaRpc ? await handleDataTool(spec.name, args, ctx.bearer, ctx.rpc, ctx.origin) : await handleDevTool(spec.name, args), legacyKey))
  }

  const failed = isFailure(result)
  if (spec.write && !failed) {
    const me = await ctx.self()
    if (me) result = { ...result, you: cleanProfileText(me.name, 40) }
  }
  if (spec.kick && !failed) kickWebhookWorker()
  return { tool: spec.name, status: failed ? 'error' : 'ok', result: toContent(spec, result) }
}
