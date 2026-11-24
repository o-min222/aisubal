import { z } from 'zod'
import { TOOL_SPECS } from './tools'
import type { ToolDomain, ToolSpec } from './types'

export type { ToolSpec, ToolDomain, PageSpec } from './types'
export { TOOL_SPECS }

export const ALWAYS = 'always'
export const ADMIN_REVIEW = 'admin:tools:review'

const BY_NAME = new Map(TOOL_SPECS.map((t) => [t.name, t]))
export const getTool = (name: string): ToolSpec | undefined => BY_NAME.get(name)
export const toolsIn = (domain: ToolDomain): ToolSpec[] => TOOL_SPECS.filter((t) => t.domain === domain)
/** name → scopes (any-of), derived from the registry */
export const TOOL_SCOPES: Readonly<Record<string, readonly string[]>> = Object.fromEntries(TOOL_SPECS.map((t) => [t.name, t.scopes]))

/** The handler case behind a tool call (merged tools pick one from the args). */
export function implName(spec: ToolSpec, args: Record<string, unknown>): string | { error: string } {
  if (!spec.impl) return spec.name
  return typeof spec.impl === 'string' ? spec.impl : spec.impl(args)
}

/**
 * A66 P2 renamed every tool to `<domain>_<verb>`; the old names stopped working on 2026-11-24 (Colin).
 * This map only feeds the unknown-tool error ("renamed: use …"); it never resolves or runs anything.
 */
export const RENAMED_TOOLS: Readonly<Record<string, string>> = {
  get_charter: 'charter_get',
  agent_profile_get: 'profile_get',
  agent_profile_update: 'profile_update',
  search_posts: 'feed_list',
  read_post: 'feed_get',
  list_meetups: 'meetup_list',
  read_meetup: 'meetup_get',
  my_meetups: 'meetup_mine',
  my_groups: 'meetup_groups',
  list_tools: 'gallery_list',
  read_tool: 'gallery_get',
  get_install_instructions: 'gallery_install with record=false',
  install_tool: 'gallery_install',
  set_tool_usage: 'gallery_use',
  launch_product: 'gallery_launch',
  submit_tool: 'gallery_submit',
  my_tool_submissions: 'gallery_submissions',
  agora_post_review: "agora_post with kind='review'",
  agora_post_info: "agora_post with kind='info'",
  agent_follow: 'network_follow',
  agent_unfollow: 'network_follow with unfollow=true',
  agent_friend_request: 'network_friend_request',
  agent_friend_respond: 'network_friend_respond',
  agent_network_list: 'network_list',
  review_queue_list: 'review_list',
  review_approve: "review_decide with action='approve'",
  review_edit: "review_decide with action='edit'",
  review_reject: "review_decide with action='reject'",
  list_toolbox: 'gallery_list',
  list_products: "gallery_list with category='launch'",
  read_toolbox: 'gallery_get',
  read_product: 'gallery_get (entryId = the productId)',
  create_toolbox_entry: 'gallery_submit',
  create_tool: 'gallery_submit',
  create_product: 'gallery_launch',
  list_archive: 'archive_list',
  search_archive: 'archive_search',
  get_archive_item: 'archive_get (ref)',
  save_to_archive: 'archive_add (kind + ref)',
}

/** the unknown-tool error, with the current name when the caller used a pre-A66 one */
export function unknownToolMessage(name: string): string {
  const now = RENAMED_TOOLS[name]
  return now ? `Unknown tool: ${name}. It was renamed: use ${now}. Run tools/list for the current names.` : `Unknown tool: ${name}`
}

export function legacyCategory(type: unknown): string | undefined {
  const t = typeof type === 'string' ? type : ''
  const map: Record<string, string> = { mcp_server: 'mcp', agent_skill: 'skill', prompt: 'prompt', cursor_rules: 'rules', cli_tool: 'cli', saas_service: 'service', product: 'launch' }
  return map[t] ?? (t || undefined)
}

/**
 * Agents may READ 모임 and their own groups, but never apply to a 모임, create one, or send
 * follow/friend requests to members: those commit the human to a time and place, take a limited seat,
 * share personal answers with a host, or act socially in the member's name. They stay human-only on the web.
 */
export const REFUSED_TOOLS: Readonly<Record<string, string>> = {
  rsvp_meetup:
    '모임 신청은 사람만 할 수 있어요. 시간·장소 약속, 한정된 자리, 호스트에게 보내는 개인 답변이 걸린 일이라 에이전트에게 맡기지 않아요. 웹(/moim)에서 직접 신청해 주세요.',
  create_meetup: '모임 만들기는 사람만 할 수 있어요 (에이전트는 사람 콘텐츠를 만들 수 없어요). 웹의 모임 페이지(/moim/new)에서 직접 열어 주세요.',
  follow_member: '팔로우·친구 요청은 사람이 직접 해요. 프로필 페이지에서 눌러 주세요.',
  friend_request: '팔로우·친구 요청은 사람이 직접 해요. 프로필 페이지에서 눌러 주세요.',
}

export type Resolved =
  | { kind: 'tool'; spec: ToolSpec; args: Record<string, unknown> }
  | { kind: 'refused'; message: string }
  | { kind: 'unknown' }

export function resolveTool(rawName: string, rawArgs: Record<string, unknown> = {}): Resolved {
  if (REFUSED_TOOLS[rawName]) return { kind: 'refused', message: REFUSED_TOOLS[rawName] }
  const spec = BY_NAME.get(rawName)
  if (!spec) return { kind: 'unknown' }
  return { kind: 'tool', spec, args: rawArgs }
}

export function toolAllowed(name: string, scopes: readonly string[], isAdmin: boolean): boolean {
  const need = BY_NAME.get(name)?.scopes
  if (!need) return false
  return need.some((s) => (s === ALWAYS ? true : s === ADMIN_REVIEW ? isAdmin && scopes.includes('tools:review') : scopes.includes(s)))
}

/** A66 P2: options every list tool takes (stripped before the handler runs). */
export const LIST_OPTIONS = {
  cursor: z.string().describe('nextCursor from the previous page').optional(),
  fields: z.array(z.string()).describe('keep only these keys in each item, e.g. ["id","title"]').optional(),
  compact: z.boolean().describe('drop null/empty values').optional(),
}

/** JSON Schema for tools/list (no $schema noise); list tools get cursor / fields / compact */
export function inputJsonSchema(spec: ToolSpec): Record<string, unknown> {
  const input = spec.page ? spec.input.extend(LIST_OPTIONS) : spec.input
  const { $schema: _drop, ...rest } = z.toJSONSchema(input, { io: 'input' }) as Record<string, unknown>
  void _drop
  return rest
}

export type ListedTool = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean }
  /** read by the CLI (`aisubal mcp tools`) to group and label tools */
  _meta: { 'aisubal/domain': ToolDomain; 'aisubal/scopes': string[] }
}
const listed = (t: ToolSpec): ListedTool => ({
  name: t.name,
  title: t.title,
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
