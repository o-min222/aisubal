import type {
  ToolboxCompatVote,
  ToolboxEntry,
  ToolboxEnvironment,
  ToolboxMention,
  ToolboxReview,
  ToolboxType,
} from '@/lib/supabase/types'

/** Normalize GitHub / skill / MCP / SaaS URLs for dedupe */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    u.hash = ''
    u.search = ''
    let host = u.hostname.toLowerCase().replace(/^www\./, '')
    let pathname = u.pathname.replace(/\/+$/, '')

    if (host === 'github.com') {
      const parts = pathname.split('/').filter(Boolean)
      if (parts.length >= 2) {
        pathname = `/${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`
      }
      return `https://github.com${pathname}`
    }

    if (host === 'npmjs.com' || host === 'www.npmjs.com') {
      host = 'www.npmjs.com'
    }

    return `https://${host}${pathname}`.toLowerCase()
  } catch {
    return raw.trim().toLowerCase()
  }
}

export function extractGithubOwnerRepo(
  url: string
): { owner: string; repo: string } | null {
  const c = canonicalUrl(url)
  const m = c.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

export function isToolishUrl(url: string): boolean {
  const c = canonicalUrl(url)
  if (c.includes('github.com/')) return true
  if (c.includes('npmjs.com/package/')) return true
  if (/\bmcp\b/i.test(c) || /skill/i.test(c)) return true
  return false
}

export function inferToolboxType(url: string, name = ''): ToolboxType {
  const s = `${url} ${name}`.toLowerCase()
  if (s.includes('mcp')) return 'mcp_server'
  if (s.includes('skill')) return 'agent_skill'
  if (s.includes('rule') || s.includes('.cursorrules')) return 'cursor_rules'
  if (s.includes('prompt')) return 'prompt'
  if (s.includes('cli') || s.includes('aider') || s.includes('codex') || s.includes('gemini-cli')) {
    return 'cli_tool'
  }
  if (!s.includes('github.com')) return 'saas_service'
  return 'mcp_server'
}

export function upsertByCanonicalUrl(
  entries: ToolboxEntry[],
  incoming: Omit<ToolboxEntry, 'id' | 'created_at' | 'updated_at'> & {
    id?: string
    created_at?: string
    updated_at?: string
  }
): { entries: ToolboxEntry[]; entry: ToolboxEntry; created: boolean } {
  const key = canonicalUrl(incoming.canonical_url)
  const idx = entries.findIndex((e) => canonicalUrl(e.canonical_url) === key)
  const now = new Date().toISOString()
  if (idx >= 0) {
    const prev = entries[idx]
    const merged: ToolboxEntry = {
      ...prev,
      name: incoming.name || prev.name,
      one_liner: incoming.one_liner || prev.one_liner,
      description: incoming.description || prev.description,
      type: incoming.type || prev.type,
      tags: Array.from(new Set([...prev.tags, ...(incoming.tags || [])])),
      icon_url: incoming.icon_url ?? prev.icon_url,
      github_url: incoming.github_url ?? prev.github_url,
      homepage_url: incoming.homepage_url ?? prev.homepage_url,
      license: incoming.license ?? prev.license,
      last_commit_at: incoming.last_commit_at ?? prev.last_commit_at,
      source_repo: incoming.source_repo ?? prev.source_repo,
      install_snippets: { ...prev.install_snippets, ...incoming.install_snippets },
      mention_count: Math.max(prev.mention_count, incoming.mention_count || 0),
      updated_at: now,
    }
    const next = [...entries]
    next[idx] = merged
    return { entries: next, entry: merged, created: false }
  }
  const entry: ToolboxEntry = {
    id: incoming.id || `tool-${Date.now()}`,
    slug: incoming.slug,
    name: incoming.name,
    one_liner: incoming.one_liner,
    description: incoming.description,
    type: incoming.type,
    tags: incoming.tags || [],
    icon_url: incoming.icon_url ?? null,
    canonical_url: key,
    github_url: incoming.github_url ?? null,
    homepage_url: incoming.homepage_url ?? null,
    license: incoming.license ?? null,
    last_commit_at: incoming.last_commit_at ?? null,
    source_repo: incoming.source_repo ?? null,
    install_snippets: incoming.install_snippets || {},
    mention_count: incoming.mention_count || 0,
    install_count: incoming.install_count || 0,
    avg_rating: incoming.avg_rating || 0,
    rating_count: incoming.rating_count || 0,
    created_by_id: incoming.created_by_id ?? null,
    featured: incoming.featured ?? false,
    created_at: incoming.created_at || now,
    updated_at: now,
  }
  return { entries: [...entries, entry], entry, created: true }
}

export function recordMention(
  mentions: ToolboxMention[],
  entryId: string,
  postId: string,
  url: string
): { mentions: ToolboxMention[]; added: boolean } {
  const key = canonicalUrl(url)
  const exists = mentions.some(
    (m) => m.entry_id === entryId && m.post_id === postId && canonicalUrl(m.url) === key
  )
  if (exists) return { mentions, added: false }
  return {
    added: true,
    mentions: [
      ...mentions,
      {
        id: `tm-${entryId}-${postId}`,
        entry_id: entryId,
        post_id: postId,
        url: key,
        created_at: new Date().toISOString(),
      },
    ],
  }
}

export function recomputeRating(
  reviews: ToolboxReview[],
  entryId: string
): { avg: number; count: number } {
  const list = reviews.filter((r) => r.entry_id === entryId)
  if (list.length === 0) return { avg: 0, count: 0 }
  const sum = list.reduce((a, r) => a + r.rating, 0)
  return { avg: Math.round((sum / list.length) * 10) / 10, count: list.length }
}

export function upsertReview(
  reviews: ToolboxReview[],
  entryId: string,
  memberId: string,
  rating: number,
  body: string
): { ok: true; reviews: ToolboxReview[] } | { ok: false; reason: string } {
  if (rating < 1 || rating > 5) return { ok: false, reason: '별점은 1~5점입니다.' }
  if (body.trim().length > 500) return { ok: false, reason: '리뷰는 500자 이내입니다.' }
  const now = new Date().toISOString()
  const idx = reviews.findIndex((r) => r.entry_id === entryId && r.member_id === memberId)
  if (idx >= 0) {
    const next = [...reviews]
    next[idx] = { ...next[idx], rating, body: body.trim(), updated_at: now }
    return { ok: true, reviews: next }
  }
  return {
    ok: true,
    reviews: [
      ...reviews,
      {
        id: `tr-${entryId}-${memberId}`,
        entry_id: entryId,
        member_id: memberId,
        rating,
        body: body.trim(),
        created_at: now,
        updated_at: now,
      },
    ],
  }
}

export function upsertCompatVote(
  votes: ToolboxCompatVote[],
  entryId: string,
  memberId: string,
  environment: ToolboxEnvironment,
  works: boolean
): ToolboxCompatVote[] {
  const idx = votes.findIndex(
    (v) =>
      v.entry_id === entryId &&
      v.member_id === memberId &&
      v.environment === environment
  )
  const now = new Date().toISOString()
  if (idx >= 0) {
    const next = [...votes]
    next[idx] = { ...next[idx], works, created_at: now }
    return next
  }
  return [
    ...votes,
    {
      id: `tc-${entryId}-${memberId}-${environment}`,
      entry_id: entryId,
      member_id: memberId,
      environment,
      works,
      created_at: now,
    },
  ]
}

export function compatSummary(
  votes: ToolboxCompatVote[],
  entryId: string
): Record<ToolboxEnvironment, { yes: number; no: number }> {
  const envs: ToolboxEnvironment[] = [
    'claude_code',
    'claude_desktop',
    'cursor',
    'codex_cli',
    'chatgpt',
    'gemini_cli',
  ]
  const out = {} as Record<ToolboxEnvironment, { yes: number; no: number }>
  for (const e of envs) out[e] = { yes: 0, no: 0 }
  for (const v of votes.filter((x) => x.entry_id === entryId)) {
    if (v.works) out[v.environment].yes += 1
    else out[v.environment].no += 1
  }
  return out
}

export type ToolboxSort = 'trending' | 'rated' | 'newest' | 'mentions' | 'installs'

export function sortEntries(
  entries: ToolboxEntry[],
  sort: ToolboxSort
): ToolboxEntry[] {
  const list = [...entries]
  switch (sort) {
    case 'rated':
      return list.sort(
        (a, b) =>
          b.avg_rating - a.avg_rating ||
          b.rating_count - a.rating_count ||
          a.name.localeCompare(b.name)
      )
    case 'newest':
      return list.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    case 'mentions':
      return list.sort((a, b) => b.mention_count - a.mention_count)
    case 'installs':
      return list.sort((a, b) => b.install_count - a.install_count)
    case 'trending':
    default:
      // simple score: mentions*2 + installs + rating*rating_count
      return list.sort((a, b) => {
        const sa = a.mention_count * 2 + a.install_count + a.avg_rating * a.rating_count
        const sb = b.mention_count * 2 + b.install_count + b.avg_rating * b.rating_count
        return sb - sa
      })
  }
}

export function defaultInstallSnippets(entry: {
  name: string
  type: ToolboxType
  source_repo: string | null
  github_url: string | null
  canonical_url: string
}): Partial<Record<ToolboxEnvironment | 'generic', string>> {
  const repo = entry.source_repo || extractGithubOwnerRepo(entry.canonical_url)
  const repoStr = typeof repo === 'string' ? repo : repo ? `${repo.owner}/${repo.repo}` : null
  const npxPkg = repoStr ? `@${repoStr.replace('/', '-')}` : entry.name

  if (entry.type === 'mcp_server') {
    const mcpJson = `{
  "mcpServers": {
    "${entry.name.toLowerCase().replace(/\\s+/g, '-')}": {
      "command": "npx",
      "args": ["-y", "${npxPkg}"]
    }
  }
}`
    return {
      cursor: `// Cursor Settings → MCP → Add new MCP Server\n// 또는 cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(entry.name)}\n${mcpJson}`,
      claude_desktop: `// ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)\n${mcpJson}`,
      claude_code: `claude mcp add ${entry.name.toLowerCase().replace(/\\s+/g, '-')} -- npx -y ${npxPkg}`,
      codex_cli: `# ~/.codex/config.toml\n[mcp_servers.${entry.name.toLowerCase().replace(/\\s+/g, '_')}]\ncommand = "npx"\nargs = ["-y", "${npxPkg}"]`,
      generic: mcpJson,
    }
  }

  if (entry.type === 'agent_skill') {
    const skillPath = repoStr || entry.name
    return {
      claude_code: `npx skills add ${skillPath}`,
      cursor: `# .cursor/skills/${entry.name.replace(/\\s+/g, '-')}/SKILL.md 로 복사\ngit clone ${entry.github_url || entry.canonical_url} /tmp/${entry.name.replace(/\\s+/g, '-')}-skill`,
      generic: `npx skills add ${skillPath}`,
    }
  }

  if (entry.type === 'cli_tool') {
    return {
      generic: repoStr ? `npm i -g ${npxPkg}\n# or: pip install ${entry.name.toLowerCase()}` : `npm i -g ${entry.name}`,
      codex_cli: repoStr ? `# Codex CLI 환경에서\nnpm i -g ${npxPkg}` : `npm i -g ${entry.name}`,
      gemini_cli: `# Gemini CLI와 함께 사용\nnpm i -g ${npxPkg}`,
      cursor: `# 터미널에서 설치 후 Cursor Agent에서 호출\nnpm i -g ${npxPkg}`,
    }
  }

  if (entry.type === 'cursor_rules') {
    return {
      cursor: `# .cursor/rules/${entry.name.replace(/\\s+/g, '-')}.mdc 에 규칙 추가\ncurl -L ${entry.github_url || entry.canonical_url}/raw/main/.cursorrules -o .cursorrules`,
      generic: `git clone ${entry.github_url || entry.canonical_url}`,
    }
  }

  return {
    generic: `Visit ${entry.canonical_url}`,
    chatgpt: `# ChatGPT / Custom GPT에서 해당 서비스 API 키를 연결하세요\n# ${entry.canonical_url}`,
  }
}

export const TOOLBOX_TYPE_LABEL: Record<ToolboxType, string> = {
  agent_skill: 'Agent Skill',
  mcp_server: 'MCP',
  cursor_rules: 'Cursor Rules',
  prompt: 'Prompt',
  cli_tool: 'CLI',
  saas_service: 'SaaS',
}

export const TOOLBOX_ENV_LABEL: Record<ToolboxEnvironment, string> = {
  claude_code: 'Claude Code',
  claude_desktop: 'Claude Desktop',
  cursor: 'Cursor',
  codex_cli: 'Codex CLI',
  chatgpt: 'ChatGPT',
  gemini_cli: 'Gemini CLI',
}
