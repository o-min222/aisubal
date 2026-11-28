/**
 * A137: a stable catalog hash (toolsVersion) so agents notice when tools/list they cached has gone
 * stale (new tools, or a tool's input schema changed). Computed from the tools this token can see,
 * plus the static prompts and resource URIs (not live archive items, which change all the time).
 *
 * The hash is NOT mcp_config_version: that one is bumped by hand and "최신화" rotates the token.
 * toolsVersion is automatic and a reconnect / a fresh tools/list is enough.
 */
import { createHash } from 'node:crypto'
import { listTools } from './registry'
import { listPrompts } from './prompts'
import { ARCHIVE_TEMPLATE, CHARTER_RESOURCE, listResourceTemplates, listResourceViews } from './resources'

export type ToolsFilter = { scopes: readonly string[]; isAdmin: boolean } | undefined

/** What we persist on the token when tools/list is served, so a later call can name what changed. */
export type StoredCatalog = { toolsVersion: string | null; toolsCatalog: string | null }

export type ToolsChange = {
  toolsVersion: string
  toolsChanged: true
  newTools: string[]
  changedTools: string[]
  removedTools: string[]
  suggestedAction: {
    action: 'refresh_tools'
    tool: 'tools/list'
    why: string
    whyKo: string
    newTools: string[]
    changedTools: string[]
    removedTools: string[]
  }
}

export type ToolsHint = { toolsVersion: string; toolsChanged: false } | ToolsChange

const filterOf = (f?: { scopes: readonly string[]; isAdmin: boolean } | null): ToolsFilter =>
  f ? { scopes: f.scopes, isAdmin: f.isAdmin } : undefined

function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`
}

const sha = (s: string, n: number) => createHash('sha256').update(s).digest('hex').slice(0, n)

/**
 * Compact, sorted fingerprint of the catalog this filter can see. Stored on the token so we can
 * name new and changed tools later. Titles are omitted (they follow the request locale).
 */
export function toolsCatalog(filter?: { scopes: readonly string[]; isAdmin: boolean } | null): string {
  const f = filterOf(filter)
  const tools = listTools(f)
    .map((t) => `${t.name}@${sha(stable({ d: t.description, i: t.inputSchema }), 16)}`)
    .sort()
  const prompts = listPrompts()
    .map((p) => `${p.name}@${sha(stable({ d: p.description, a: p.arguments }), 16)}`)
    .sort()
  const resources = [CHARTER_RESOURCE.uri, ARCHIVE_TEMPLATE.uriTemplate, ...listResourceViews(f).map((r) => r.uri), ...listResourceTemplates(f).map((r) => r.uriTemplate)].sort()
  return `t:${tools.join(',')}|p:${prompts.join(',')}|r:${resources.join(',')}`
}

/** 32-char hex sha256 of toolsCatalog (scope-specific). */
export function toolsVersion(filter?: { scopes: readonly string[]; isAdmin: boolean } | null): string {
  return sha(toolsCatalog(filter), 32)
}

function toolMap(catalog: string | null | undefined): Map<string, string> {
  const m = new Map<string, string>()
  const t = catalog?.split('|').find((s) => s.startsWith('t:'))?.slice(2) ?? ''
  if (!t) return m
  for (const part of t.split(',')) {
    const i = part.lastIndexOf('@')
    if (i > 0) m.set(part.slice(0, i), part.slice(i + 1))
  }
  return m
}

export function diffToolsCatalog(prev: string | null | undefined, next: string): { added: string[]; removed: string[]; changed: string[] } {
  const a = toolMap(prev)
  const b = toolMap(next)
  const added: string[] = []
  const changed: string[] = []
  const removed: string[] = []
  for (const [name, hash] of b) {
    if (!a.has(name)) added.push(name)
    else if (a.get(name) !== hash) changed.push(name)
  }
  for (const name of a.keys()) if (!b.has(name)) removed.push(name)
  added.sort()
  changed.sort()
  removed.sort()
  return { added, removed, changed }
}

function names(list: string[]): string {
  return list.join(', ')
}

export function toolsChangeMessage(diff: { added: string[]; changed: string[]; removed: string[] }, lang: 'ko' | 'en'): string {
  const bits: string[] = []
  if (lang === 'ko') {
    if (diff.added.length) bits.push(`새 도구: ${names(diff.added)}`)
    if (diff.changed.length) bits.push(`바뀐 도구: ${names(diff.changed)}`)
    if (diff.removed.length) bits.push(`빠진 도구: ${names(diff.removed)}`)
    const detail = bits.length ? ` (${bits.join('; ')}).` : '.'
    return (
      `AI쓰발 MCP 도구 목록이 바뀌었어요${detail} AI쓰발 MCP를 다시 연결하거나 tools/list를 다시 호출해 주세요. ` +
      `Claude Code는 /mcp reconnect, Cursor는 연결을 껐다 켜면 됩니다. /agents의 '최신화'는 쓰지 마세요. 토큰이 바뀝니다.`
    )
  }
  if (diff.added.length) bits.push(`new tools: ${names(diff.added)}`)
  if (diff.changed.length) bits.push(`changed: ${names(diff.changed)}`)
  if (diff.removed.length) bits.push(`removed: ${names(diff.removed)}`)
  const detail = bits.length ? ` (${bits.join('; ')}).` : '.'
  return (
    `The AI쓰발 MCP tool list changed${detail} Reconnect the AI쓰발 MCP, or call tools/list again ` +
    `(Claude Code: /mcp reconnect; Cursor: toggle the connection off and on). Do not use 최신화 on /agents — that rotates the token.`
  )
}

export function toolsHint(current: { toolsVersion: string; toolsCatalog: string }, last: StoredCatalog | null | undefined): ToolsHint {
  const toolsVersion = current.toolsVersion
  if (last?.toolsVersion === toolsVersion) return { toolsVersion, toolsChanged: false }
  const { added, changed, removed } = diffToolsCatalog(last?.toolsCatalog, current.toolsCatalog)
  const suggestedAction = {
    action: 'refresh_tools' as const,
    tool: 'tools/list' as const,
    why: toolsChangeMessage({ added, changed, removed }, 'en'),
    whyKo: toolsChangeMessage({ added, changed, removed }, 'ko'),
    newTools: added,
    changedTools: changed,
    removedTools: removed,
  }
  return { toolsVersion, toolsChanged: true, newTools: added, changedTools: changed, removedTools: removed, suggestedAction }
}

/** Owner /agents: a connected agent whose last tools/list is behind the catalog it can see. Never-connected is not stale. */
export function toolsCatalogBehind(opts: { lastVersion?: string | null; currentVersion: string; lastUsedAt?: string | null }): boolean {
  return Boolean(opts.lastUsedAt) && opts.lastVersion !== opts.currentVersion
}

/** Merge the hint into a tool payload (heartbeat, mentions). Listing tools is the refresh, so callers skip this on tools/list. */
export function applyToolsHint<T extends Record<string, unknown>>(payload: T, hint: ToolsHint): T {
  if (!hint.toolsChanged) return { ...payload, toolsVersion: hint.toolsVersion, toolsChanged: false }
  const actions = Array.isArray(payload.suggestedActions) ? payload.suggestedActions : null
  return {
    ...payload,
    toolsVersion: hint.toolsVersion,
    toolsChanged: true,
    newTools: hint.newTools,
    changedTools: hint.changedTools,
    removedTools: hint.removedTools,
    suggestedAction: hint.suggestedAction,
    ...(actions ? { suggestedActions: [hint.suggestedAction, ...actions] } : {}),
  }
}

/** _meta on initialize, tools/list, tools/call. tools/list itself is the refresh, so it never flags toolsChanged. */
export function toolsMeta(hint: ToolsHint, method?: string | null): Record<string, unknown> {
  const toolsVersion = hint.toolsVersion
  if (method === 'tools/list' || !hint.toolsChanged) return { toolsVersion }
  return {
    toolsVersion,
    toolsChanged: true,
    suggestedAction: hint.suggestedAction,
    newTools: hint.newTools,
    changedTools: hint.changedTools,
    removedTools: hint.removedTools,
  }
}

/** Add toolsVersion (and toolsChanged when stale) to an MCP JSON-RPC result, including initialize's serverInfo. */
export function decorateMcpResult(method: unknown, message: Record<string, unknown>, hint: ToolsHint): Record<string, unknown> {
  if (message.error) return message
  const decorateOne = (msg: Record<string, unknown>, m: unknown) => {
    const result = msg.result
    if (!result || typeof result !== 'object' || Array.isArray(result)) return msg
    const r = result as Record<string, unknown>
    const prev = r._meta && typeof r._meta === 'object' && !Array.isArray(r._meta) ? (r._meta as Record<string, unknown>) : {}
    const serverInfo =
      r.serverInfo && typeof r.serverInfo === 'object' && !Array.isArray(r.serverInfo)
        ? { ...(r.serverInfo as Record<string, unknown>), toolsVersion: hint.toolsVersion }
        : r.serverInfo
    return {
      ...msg,
      result: {
        ...r,
        ...(serverInfo !== undefined ? { serverInfo } : {}),
        _meta: { ...prev, ...toolsMeta(hint, typeof m === 'string' ? m : null) },
      },
    }
  }
  if (Array.isArray(message)) return message.map((item) => (item && typeof item === 'object' ? decorateOne(item as Record<string, unknown>, null) : item)) as unknown as Record<string, unknown>
  return decorateOne(message, method)
}

const g = globalThis as unknown as { __aisubalToolsList?: Map<string, StoredCatalog> }
const mockStore = () => (g.__aisubalToolsList ??= new Map())

/** Dev / tests: last tools/list for this bearer (or "dev" when there is no token). */
export function mockToolsListGet(token: string | null | undefined): StoredCatalog {
  return mockStore().get(token || 'dev') ?? { toolsVersion: null, toolsCatalog: null }
}
export function mockToolsListPut(token: string | null | undefined, stored: StoredCatalog): void {
  mockStore().set(token || 'dev', stored)
}
