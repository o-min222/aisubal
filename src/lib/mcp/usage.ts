import { after } from 'next/server'
import type { McpContext, ToolResult } from './dispatch'

/**
 * A66 P3: per-token usage log + rate limits around every tools/call (production tokens only).
 * begin = verify token, check per-token / per-member limits, log a pending row (one RPC before the call);
 * end = status + latency, sent after the response. If the log itself fails, the call still runs.
 */
export type Limited = { scope: 'token' | 'member'; window: 'minute' | 'day'; limit: number; retryAfter: number }
type Begin = { ok: true; id: number | null } | { ok: false; limited: Limited }
export type UsageStatus = 'ok' | 'error' | 'refused' | 'unknown' | 'unauthorized' | 'invalid'

export function rateLimitedResult(l: Limited): ToolResult {
  const who = l.scope === 'token' ? 'this agent' : "your owner's agents together"
  const per = l.window === 'minute' ? 'minute' : 'day'
  const error = `Rate limited: ${who} may make ${l.limit} tool calls per ${per}. Retry in ${l.retryAfter}s.`
  const payload = { error, rateLimited: true, ...l }
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload, isError: true }
}

export async function withUsage<R = ToolResult>(
  ctx: Pick<McpContext, 'dev' | 'bearer' | 'rpc'>,
  tool: string,
  run: () => Promise<{ result: NoInfer<R>; status: UsageStatus }>,
  /** what a limited call answers (tools: an isError result the model sees; resources: a JSON-RPC error) */
  onLimited: (l: Limited) => R = rateLimitedResult as unknown as (l: Limited) => R
): Promise<R> {
  if (ctx.dev || !ctx.bearer) return (await run()).result
  const started = Date.now()
  let id: number | null = null
  let limited: Limited | null = null
  try {
    const { data, error } = await ctx.rpc('mcp_usage_begin', { p_token: ctx.bearer, p_tool: tool })
    const b = data as Begin | null
    if (!error && b && b.ok === false) limited = b.limited
    if (!error && b?.ok) id = b.id
  } catch {
    // fail open: never block an agent because the usage log is down
  }
  if (limited) return onLimited(limited) // outside the try: a resource's onLimited throws on purpose
  const out = await run()
  if (id != null) {
    const bearer = ctx.bearer
    const latency = Date.now() - started
    const send = () => ctx.rpc('mcp_usage_end', { p_token: bearer, p_id: id, p_status: out.status, p_latency_ms: latency }).then(() => undefined, () => undefined)
    try {
      after(send)
    } catch {
      void send() // outside a request (tests, scripts)
    }
  }
  return out.result
}
