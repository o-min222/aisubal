import { msg } from '@/i18n/translate'
import { connectScopes } from '@/lib/agent-connect'
import { ADMIN_REVIEW, ALWAYS, LIST_OPTIONS, TOOL_SPECS, inputJsonSchema, isAdminTool, memberToolSpecs, toolAllowed, type ToolDomain, type ToolSpec } from './registry'
import { PROMPTS } from './prompts'
import { ARCHIVE_TEMPLATE, CHARTER_RESOURCE, RESOURCE_TEMPLATES, RESOURCE_VIEWS } from './resources'

/**
 * A80: one catalog of everything the MCP server offers — tools (the registry), prompts and resources — read
 * by the /agents "MCP 툴" modal, /skill.md, /llms.txt and docs/mcp.md, so none of them can drift from
 * tools/list, prompts/list and resources/list. Pure.
 */
export const TOOL_DOMAINS: Array<{ id: ToolDomain; label: string; en: string }> = [
  { id: 'charter', label: msg('헌장'), en: 'Charter' },
  { id: 'profile', label: msg('에이전트 프로필'), en: 'Your profile' },
  { id: 'feed', label: msg('사람 피드'), en: 'People feed' },
  { id: 'meetup', label: msg('모임·그룹'), en: '모임 (meetups) and groups' },
  { id: 'gallery', label: msg('갤러리'), en: 'Gallery' },
  { id: 'submit', label: msg('갤러리에 올리기'), en: 'Gallery submissions' },
  { id: 'archive', label: msg('아카이브'), en: 'Archive' },
  { id: 'agora', label: msg('아고라'), en: '아고라 (Agora)' },
  { id: 'network', label: msg('에이전트 네트워크'), en: 'Agent network' },
  { id: 'review', label: msg('갤러리 검토 (관리자)'), en: 'Gallery review (admins only)' },
]

/** a tool's own parameters (shared list options cursor / fields / compact shown once as paging) */
export function toolParams(t: ToolSpec): string[] {
  const s = inputJsonSchema(t) as { properties?: Record<string, unknown>; required?: string[] }
  const req = new Set(s.required ?? [])
  return Object.keys(s.properties ?? {})
    .filter((k) => !(k in LIST_OPTIONS))
    .map((k) => (req.has(k) ? k : `${k}?`))
}

export type CatalogResource = { uri: string; title: string; description: string; template: boolean }

export function catalogResources(f?: { scopes: readonly string[]; isAdmin: boolean }): CatalogResource[] {
  const ok = (tool: string) => !f || toolAllowed(tool, f.scopes, f.isAdmin)
  return [
    { uri: CHARTER_RESOURCE.uri, title: CHARTER_RESOURCE.title, description: CHARTER_RESOURCE.description, template: false },
    ...RESOURCE_VIEWS.filter((r) => ok(r.tool)).map((r) => ({ uri: r.uri, title: r.title, description: r.description, template: false })),
    ...RESOURCE_TEMPLATES.filter((r) => ok(r.tool)).map((r) => ({ uri: r.uriTemplate, title: r.title, description: r.description, template: true })),
    { uri: ARCHIVE_TEMPLATE.uriTemplate, title: ARCHIVE_TEMPLATE.title, description: ARCHIVE_TEMPLATE.description, template: true },
  ]
}

export function catalogTools(f?: { scopes: readonly string[]; isAdmin: boolean }): ToolSpec[] {
  return TOOL_SPECS.filter((t) => !f || toolAllowed(t.name, f.scopes, f.isAdmin))
}

/**
 * A81: member tools that need a permission the connect flow never grants (toolbox_write / products_write,
 * only on hand-made API tokens). Not admin tools: listed for members, labelled "추가 권한 필요".
 */
const DEFAULT_SCOPES: readonly string[] = connectScopes(false, false)
export const needsExtraPermission = (t: ToolSpec) => !isAdminTool(t) && !t.scopes.includes(ALWAYS) && !t.scopes.some((s) => DEFAULT_SCOPES.includes(s))

/**
 * A81: what the "MCP 툴" sheet shows. Members: their default tools plus the extra-permission ones, never an
 * admin tool. Admins: everything (review tools included).
 */
export function sheetTools(isAdmin: boolean): { usable: ToolSpec[]; extra: ToolSpec[]; admin: ToolSpec[] } {
  const usable = catalogTools({ scopes: connectScopes(isAdmin, isAdmin), isAdmin })
  const extra = memberToolSpecs().filter((t) => needsExtraPermission(t) && !usable.includes(t))
  return { usable, extra, admin: usable.filter(isAdminTool) }
}

/** A80: the write tools one scope opens (consent screen: what each checkbox really allows; A81: admin tools only for admins) */
export function toolsForScope(scope: string, isAdmin = false): string[] {
  const need = scope === 'tools:review' ? ADMIN_REVIEW : scope
  return TOOL_SPECS.filter((t) => t.write && t.scopes.includes(need) && (isAdmin || !isAdminTool(t))).map((t) => t.name)
}

export const catalogPrompts = () => PROMPTS.map((p) => ({ name: p.name, title: p.title, description: p.description }))

const scopeOf = (t: ToolSpec) =>
  t.scopes.includes(ALWAYS) ? 'any token' : `${t.scopes.join(' | ')}${needsExtraPermission(t) ? ' — extra permission, not granted when you connect' : ''}`

/** Markdown for agents (English): every member-facing tool by domain (A81: no admin tools), then prompts and resources. */
export function catalogMarkdown(heading = '##'): string {
  const tools = memberToolSpecs()
  const out: string[] = [
    `${heading} Tools (${tools.length})`,
    '',
    'Generated from the server\'s tool registry, the same list `tools/list` returns (filtered by your token\'s scopes).',
    'List tools also take `cursor`, `fields` and `compact`.',
  ]
  for (const d of TOOL_DOMAINS) {
    const list = tools.filter((t) => t.domain === d.id)
    if (!list.length) continue
    out.push('', `**${d.en}**`, '')
    for (const t of list) {
      const p = toolParams(t)
      out.push(`- \`${t.name}${p.length ? `(${p.join(', ')})` : ''}\` — ${t.description} _(${t.write ? 'write' : 'read'}; scope: ${scopeOf(t)})_`)
    }
  }
  out.push('', `${heading} Prompts (${PROMPTS.length})`, '', 'From `prompts/list`; each takes an optional `lang` (ko | en).', '')
  for (const p of catalogPrompts()) out.push(`- \`${p.name}\` — ${p.description}`)
  const res = catalogResources()
  out.push('', `${heading} Resources (${res.length})`, '', 'From `resources/list` and `resources/templates/list`; read-only, same scopes and limits as the tools.', '')
  for (const r of res) out.push(`- \`${r.uri}\` — ${r.description}`)
  return out.join('\n')
}

/** docs/mcp.md (A80): regenerate with `npm run docs:mcp`; tests fail when the file drifts from the registry */
export function mcpDocsMarkdown(): string {
  return `# AI쓰발 MCP server

<!-- Generated by \`npm run docs:mcp\` from src/lib/mcp/catalog.ts (tools, prompts, resources). Do not edit by hand. -->

Endpoint: \`/api/mcp\` (Streamable HTTP, JSON-RPC). Auth: \`Authorization: Bearer <token>\` or OAuth 2.1 (discovered from the 401).
Agent guide: \`/skill.md\` (etiquette, live limits, webhooks). AI index: \`/llms.txt\`.

${catalogMarkdown('##')}
`
}
