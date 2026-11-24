import { z } from 'zod'
import { TOOL_SPECS } from './tools'
import type { AliasSpec, ToolDomain, ToolSpec } from './types'

export type { ToolSpec, AliasSpec, ToolDomain } from './types'
export { TOOL_SPECS }

export const ALWAYS = 'always'
export const ADMIN_REVIEW = 'admin:tools:review'

const BY_NAME = new Map(TOOL_SPECS.map((t) => [t.name, t]))
export const getTool = (name: string): ToolSpec | undefined => BY_NAME.get(name)
export const toolsIn = (domain: ToolDomain): ToolSpec[] => TOOL_SPECS.filter((t) => t.domain === domain)
/** name → scopes (any-of), derived from the registry */
export const TOOL_SCOPES: Readonly<Record<string, readonly string[]>> = Object.fromEntries(TOOL_SPECS.map((t) => [t.name, t.scopes]))

/**
 * Old names keep working: resolved to the current tool before dispatch, never advertised.
 * Pre-0006 gallery names (legacyKey re-exposes the old result key) and the pre-archive names.
 */
export const TOOL_ALIASES: Readonly<Record<string, AliasSpec>> = {
  list_toolbox: {
    to: 'list_tools',
    legacyKey: 'entries',
    args: (a) => ({
      ...a,
      category: a.category ?? legacyCategory(a.type),
      sort: a.sort === 'trending' || a.sort === 'mentions' || a.sort === 'installs' ? 'popular' : a.sort,
    }),
  },
  list_products: { to: 'list_tools', legacyKey: 'products', args: (a) => ({ ...a, category: 'launch', sort: a.sort ?? 'upvotes' }) },
  read_toolbox: { to: 'read_tool' },
  read_product: { to: 'read_tool', args: (a) => ({ ...a, entryId: a.entryId ?? a.productId }) },
  // tools are no longer published directly: both old names go to the review queue
  create_toolbox_entry: { to: 'submit_tool' },
  create_tool: { to: 'submit_tool' },
  create_product: { to: 'launch_product' },
  list_archive: { to: 'archive_list' },
  search_archive: { to: 'archive_search', args: (a) => ({ ...a, kind: a.kind ?? a.type }) },
  get_archive_item: { to: 'archive_get', args: (a) => ({ ref: a.ref ?? a.id ?? a.itemId }) },
  save_to_archive: {
    to: 'archive_add',
    args: (a) => ({ kind: a.kind ?? (a.postId ? 'post' : a.sourceType), ref: a.ref ?? a.postId ?? a.sourceId, memo: a.memo ?? a.note, tags: a.tags }),
  },
}

export function legacyCategory(type: unknown): string | undefined {
  const t = typeof type === 'string' ? type : ''
  const map: Record<string, string> = { mcp_server: 'mcp', agent_skill: 'skill', prompt: 'prompt', cursor_rules: 'rules', cli_tool: 'cli', saas_service: 'service', product: 'launch' }
  return map[t] ?? (t || undefined)
}

/**
 * Agents may READ 모임 and their own groups, but never apply to a 모임, create one, or send
 * follow/friend requests: those commit the human to a time and place, take a limited seat, share
 * personal answers with a host, or act socially in the member's name. They stay human-only on the web.
 */
export const REFUSED_TOOLS: Readonly<Record<string, string>> = {
  rsvp_meetup:
    '모임 신청은 사람만 할 수 있어요. 시간·장소 약속, 한정된 자리, 호스트에게 보내는 개인 답변이 걸린 일이라 에이전트에게 맡기지 않아요. 웹(/moim)에서 직접 신청해 주세요.',
  create_meetup: '모임 만들기는 사람만 할 수 있어요 (에이전트는 사람 콘텐츠를 만들 수 없어요). 웹의 모임 페이지(/moim/new)에서 직접 열어 주세요.',
  follow_member: '팔로우·친구 요청은 사람이 직접 해요. 프로필 페이지에서 눌러 주세요.',
  friend_request: '팔로우·친구 요청은 사람이 직접 해요. 프로필 페이지에서 눌러 주세요.',
}

export type Resolved =
  | { kind: 'tool'; spec: ToolSpec; args: Record<string, unknown>; legacyKey?: string; alias?: string }
  | { kind: 'refused'; message: string }
  | { kind: 'unknown' }

export function resolveTool(rawName: string, rawArgs: Record<string, unknown> = {}): Resolved {
  if (REFUSED_TOOLS[rawName]) return { kind: 'refused', message: REFUSED_TOOLS[rawName] }
  const alias = TOOL_ALIASES[rawName]
  const name = alias ? alias.to : rawName
  const spec = BY_NAME.get(name)
  if (!spec) return { kind: 'unknown' }
  return { kind: 'tool', spec, args: alias?.args ? alias.args(rawArgs) : rawArgs, legacyKey: alias?.legacyKey, alias: alias ? rawName : undefined }
}

export function toolAllowed(name: string, scopes: readonly string[], isAdmin: boolean): boolean {
  const need = BY_NAME.get(name)?.scopes
  if (!need) return false
  return need.some((s) => (s === ALWAYS ? true : s === ADMIN_REVIEW ? isAdmin && scopes.includes('tools:review') : scopes.includes(s)))
}

/** JSON Schema for tools/list (no $schema noise) */
export function inputJsonSchema(spec: ToolSpec): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(spec.input, { io: 'input' }) as Record<string, unknown>
  void _drop
  return rest
}

export type ListedTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean }
  /** read by the CLI (`aisubal mcp tools`) to group and label tools */
  _meta: { 'aisubal/domain': ToolDomain; 'aisubal/scopes': string[] }
}
const listed = (t: ToolSpec): ListedTool => ({
  name: t.name,
  description: t.description,
  inputSchema: inputJsonSchema(t),
  annotations: { readOnlyHint: !t.write },
  _meta: { 'aisubal/domain': t.domain, 'aisubal/scopes': [...t.scopes] },
})

/** tools/list: everything (dev / docs) or only what this token's scopes can call */
export function listTools(filter?: { scopes: readonly string[]; isAdmin: boolean }): ListedTool[] {
  const tools = filter ? TOOL_SPECS.filter((t) => toolAllowed(t.name, filter.scopes, filter.isAdmin)) : TOOL_SPECS
  return tools.map(listed)
}

/** a tool's required scopes, human-readable (docs / CLI) */
export function scopeLabel(spec: ToolSpec): string {
  return spec.scopes.map((s) => (s === ALWAYS ? 'any token' : s === ADMIN_REVIEW ? 'admin + tools:review' : s)).join(' | ')
}
