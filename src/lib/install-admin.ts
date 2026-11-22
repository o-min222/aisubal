import type { ToolboxEnvironment } from '@/lib/supabase/types'
import { mcpSnippets, verifiedSnippets, type Snippets } from '@/lib/install-catalog'
import { TOOLBOX_ENV_LABEL } from '@/lib/toolbox-rules'

/**
 * Admin install confirmation (/admin/installs, 0059). An entry's install commands are shown to
 * members and agents only after an admin confirms them here (tools_confirm_install). Pure:
 * shared by the screen, the API route and tests.
 */
export type InstallEnv = ToolboxEnvironment | 'generic'
export const INSTALL_ENVS: InstallEnv[] = ['generic', 'claude_code', 'cursor', 'claude_desktop', 'codex_cli', 'gemini_cli', 'chatgpt']
export const SNIPPET_MAX = 4000

export function envLabel(env: InstallEnv): string {
  return env === 'generic' ? '공통' : TOOLBOX_ENV_LABEL[env]
}

export type InstallQueueItem = {
  id: string
  slug: string
  name: string
  type: string
  oneLiner: string
  officialUrl: string
  sourceRepo: string | null
  license: string | null
  lastCommitAt: string | null
  verified: boolean
  snippets: Snippets
  verifiedAt: string | null
  verifiedBy: string | null
  installCount: number
  updatedAt: string | null
  /** commands from the checked-in verified catalog for this slug, if any */
  catalog: Snippets | null
}

export type InstallFilter = 'todo' | 'verified' | 'all'
export function parseInstallFilter(v: unknown): InstallFilter {
  return v === 'verified' || v === 'all' ? v : 'todo'
}

/** Commands from the verified catalog, or null when it only knows the docs link. */
function catalogOf(slug: string): Snippets | null {
  const c = verifiedSnippets(slug)?.snippets
  return c && Object.keys(c).length ? c : null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const str = (v: any): string | null => (typeof v === 'string' && v ? v : null)
export function parseInstallQueue(raw: unknown): InstallQueueItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r: any) => r && typeof r.id === 'string' && typeof r.name === 'string')
    .map((r: any) => ({
      id: r.id,
      slug: String(r.slug ?? ''),
      name: r.name,
      type: String(r.type ?? ''),
      oneLiner: String(r.oneLiner ?? ''),
      officialUrl: str(r.homepageUrl) ?? str(r.githubUrl) ?? String(r.canonicalUrl ?? ''),
      sourceRepo: str(r.sourceRepo),
      license: str(r.license),
      lastCommitAt: str(r.lastCommitAt),
      verified: r.verified === true,
      snippets: cleanSnippets(r.snippets).snippets,
      verifiedAt: str(r.verifiedAt),
      verifiedBy: str(r.verifiedBy),
      installCount: Number(r.installCount) || 0,
      updatedAt: str(r.updatedAt),
      catalog: catalogOf(String(r.slug ?? '')),
    }))
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Keeps known environments with non-blank text; reports the first problem. */
export function cleanSnippets(raw: unknown): { snippets: Snippets; error: null | 'env' | 'long' } {
  const out: Snippets = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { snippets: out, error: null }
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(INSTALL_ENVS as string[]).includes(k)) return { snippets: {}, error: 'env' }
    if (typeof v !== 'string') continue
    const t = v.replace(/\s+$/g, '')
    if (!t.trim()) continue
    if (t.length > SNIPPET_MAX) return { snippets: {}, error: 'long' }
    out[k as InstallEnv] = t
  }
  return { snippets: out, error: null }
}

export function filterQueue(items: InstallQueueItem[], filter: InstallFilter, q: string): InstallQueueItem[] {
  const needle = q.trim().toLowerCase()
  return items.filter(
    (i) =>
      (filter === 'all' || (filter === 'verified' ? i.verified : !i.verified)) &&
      (!needle || i.name.toLowerCase().includes(needle) || i.slug.toLowerCase().includes(needle))
  )
}

/** Fill every environment from one verified MCP package (npx) or remote URL. */
export function snippetsFromMcp(kind: 'npx' | 'remote', value: string, slug: string): Snippets | null {
  const v = value.trim()
  const name = slug.replace(/-mcp(-server)?$/, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'tool'
  if (kind === 'remote') {
    if (!/^https:\/\/[^\s]+$/.test(v)) return null
    return mcpSnippets({ kind: 'remote', name, url: v })
  }
  if (!/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.-]+)?$/i.test(v)) return null
  return mcpSnippets({ kind: 'npx', name, pkg: v })
}
