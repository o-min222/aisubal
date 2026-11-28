import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js'

/**
 * MCP 2026-07-28 (stateless: no initialize, every request carries its protocol version in params._meta),
 * served next to 2025-11-25. Our endpoint was already stateless, so the SDK server handles the request as
 * it always did; this only (a) recognises the per-request version, (b) answers server/discover and
 * (c) puts the new result envelope on the way out: resultType, ttlMs/cacheScope on cacheable results,
 * serverInfo in _meta, and -32602 for an unknown resource. Requests without the key are never touched.
 * Not enforced: the Mcp-Method / Mcp-Name request headers, subscriptions/listen, the tasks extension.
 */
export const MODERN_PROTOCOL_VERSION = '2026-07-28'
export const SUPPORTED_VERSIONS: string[] = [MODERN_PROTOCOL_VERSION, ...SUPPORTED_PROTOCOL_VERSIONS]
const PROTOCOL_VERSION_KEY = 'io.modelcontextprotocol/protocolVersion'
const CLIENT_INFO_KEY = 'io.modelcontextprotocol/clientInfo'
export const SERVER_INFO_KEY = 'io.modelcontextprotocol/serverInfo'
const UNSUPPORTED_PROTOCOL_VERSION = -32022
const HEADER_MISMATCH = -32020

type Meta = Record<string, unknown>
export type Rpc = { jsonrpc?: string; id?: unknown; method?: unknown; params?: { _meta?: Meta } & Record<string, unknown> }

/** the per-request protocol version, when the client sent one (2026-07-28 style) */
export function requestedVersion(msg: Rpc | null | undefined): string | undefined {
  const v = msg?.params?._meta?.[PROTOCOL_VERSION_KEY]
  return typeof v === 'string' ? v : undefined
}

export const clientNameOf = (msg: Rpc): string | null => {
  const ci = msg.params?._meta?.[CLIENT_INFO_KEY] as { name?: unknown; version?: unknown } | undefined
  const s = ci ? [ci.name, ci.version].filter((x) => typeof x === 'string' && x).join(' ') : ''
  return s || null
}

/** methods whose results are CacheableResult in 2026-07-28 */
const CACHEABLE_TTL_MS: Record<string, number> = {
  'server/discover': 60_000,
  'tools/list': 60_000,
  'prompts/list': 60_000,
  'resources/list': 60_000,
  'resources/templates/list': 60_000,
  'resources/read': 0,
  'skills/list': 300_000,
  'skills/get': 300_000,
  'resources/directory/read': 300_000,
}

export const versionError = (id: unknown, requested: string) => ({
  jsonrpc: '2.0' as const,
  id: id ?? null,
  error: { code: UNSUPPORTED_PROTOCOL_VERSION, message: `Unsupported protocol version: ${requested}`, data: { supported: SUPPORTED_VERSIONS, requested } },
})

export const headerMismatchError = (id: unknown, header: string, meta: string) => ({
  jsonrpc: '2.0' as const,
  id: id ?? null,
  error: { code: HEADER_MISMATCH, message: `MCP-Protocol-Version header (${header}) does not match _meta (${meta})` },
})

/** dress an SDK response for a 2026-07-28 client */
export function modernize(method: unknown, message: Record<string, unknown>, serverInfo: { name: string; version: string }): Record<string, unknown> {
  const error = message.error as { code?: number; message?: string } | undefined
  if (error) {
    // 2026-07-28 reports an unknown resource as Invalid params, not -32002
    return method === 'resources/read' && error.code === -32002 ? { ...message, error: { ...error, code: -32602 } } : message
  }
  const result = message.result
  if (!result || typeof result !== 'object' || Array.isArray(result)) return message
  const r = result as Record<string, unknown>
  const ttl = typeof method === 'string' ? CACHEABLE_TTL_MS[method] : undefined
  const meta = (r._meta && typeof r._meta === 'object' ? r._meta : {}) as Meta
  return {
    ...message,
    result: {
      resultType: 'complete',
      ...(ttl === undefined ? {} : { ttlMs: ttl, cacheScope: 'private' }),
      ...r,
      _meta: { [SERVER_INFO_KEY]: serverInfo, ...meta },
    },
  }
}
