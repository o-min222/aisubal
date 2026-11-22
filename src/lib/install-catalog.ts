import type { ToolboxEnvironment } from '@/lib/supabase/types'

/**
 * Verified install guidance (security fix B-1). Commands are NEVER derived from slugs or repo
 * names: `@owner-repo` style guesses produced packages that don't exist and could be
 * typosquatted. Every command here was checked against the npm / PyPI registry and the
 * project's official README (2026-11-22). Entries without a verified command show only the
 * official install link. New entries get commands only after a reviewer confirms them
 * (toolbox_entries.install_verified, 0033).
 */
export type Snippets = Partial<Record<ToolboxEnvironment | 'generic', string>>

type Mcp =
  | { kind: 'npx'; name: string; pkg: string; args?: string[]; env?: string[] }
  | { kind: 'remote'; name: string; url: string; note?: string }
export type VerifiedInstall = {
  /** official install / docs page shown next to (or instead of) commands */
  docs: string
  mcp?: Mcp
  /** plain commands (CLI, SDK, skills), keyed by environment; 'generic' = one block for everyone */
  commands?: Snippets
}

const q = (s: string) => JSON.stringify(s)

/** Client configs for an MCP server whose package / URL is verified. */
export function mcpSnippets(m: Mcp): Snippets {
  if (m.kind === 'remote') {
    const json = `{\n  "mcpServers": {\n    ${q(m.name)}: { "url": ${q(m.url)} }\n  }\n}`
    return {
      claude_code: `claude mcp add --transport http ${m.name} ${m.url}`,
      cursor: `// ~/.cursor/mcp.json\n${json}`,
      claude_desktop: `// Claude 데스크톱 → 설정 → 커넥터 → 커스텀 커넥터 추가\n${m.url}`,
      generic: `${m.note ? `# ${m.note}\n` : ''}${m.url}`,
    }
  }
  const args = ['-y', m.pkg, ...(m.args ?? [])]
  const env = m.env ?? []
  const envJson = env.length ? `,\n      "env": { ${env.map((k) => `${q(k)}: "<${k}>"`).join(', ')} }` : ''
  const json = `{\n  "mcpServers": {\n    ${q(m.name)}: {\n      "command": "npx",\n      "args": [${args.map(q).join(', ')}]${envJson}\n    }\n  }\n}`
  const envToml = env.length ? `\nenv = { ${env.map((k) => `${k} = "<${k}>"`).join(', ')} }` : ''
  return {
    claude_code: `claude mcp add ${m.name}${env.map((k) => ` -e ${k}=<${k}>`).join('')} -- npx ${args.join(' ')}`,
    cursor: `// ~/.cursor/mcp.json\n${json}`,
    claude_desktop: `// claude_desktop_config.json\n${json}`,
    codex_cli: `# ~/.codex/config.toml\n[mcp_servers.${m.name.replace(/-/g, '_')}]\ncommand = "npx"\nargs = [${args.map(q).join(', ')}]${envToml}`,
    gemini_cli: `// ~/.gemini/settings.json\n${json}`,
    generic: json,
  }
}

export const VERIFIED_INSTALLS: Record<string, VerifiedInstall> = {
  // ---- MCP ----
  'brave-search-mcp': { docs: 'https://github.com/brave/brave-search-mcp-server#readme', mcp: { kind: 'npx', name: 'brave-search', pkg: '@brave/brave-search-mcp-server', args: ['--transport', 'stdio'], env: ['BRAVE_API_KEY'] } },
  'browserbase-mcp': { docs: 'https://github.com/browserbase/mcp-server-browserbase#readme', mcp: { kind: 'remote', name: 'browserbase', url: 'https://mcp.browserbase.com/mcp' } },
  'chrome-devtools-mcp': { docs: 'https://github.com/ChromeDevTools/chrome-devtools-mcp#readme', mcp: { kind: 'npx', name: 'chrome-devtools', pkg: 'chrome-devtools-mcp@latest' } },
  context7: { docs: 'https://github.com/upstash/context7#readme', mcp: { kind: 'remote', name: 'context7', url: 'https://mcp.context7.com/mcp' } },
  'exa-mcp': { docs: 'https://github.com/exa-labs/exa-mcp-server#readme', mcp: { kind: 'remote', name: 'exa', url: 'https://mcp.exa.ai/mcp' } },
  'firecrawl-mcp': { docs: 'https://github.com/firecrawl/firecrawl-mcp-server#readme', mcp: { kind: 'npx', name: 'firecrawl', pkg: 'firecrawl-mcp', env: ['FIRECRAWL_API_KEY'] } },
  'github-mcp-server': { docs: 'https://github.com/github/github-mcp-server#readme', mcp: { kind: 'remote', name: 'github', url: 'https://api.githubcopilot.com/mcp/', note: 'GitHub OAuth 또는 PAT 인증이 필요해요 (공식 문서 참고)' } },
  'playwright-mcp': { docs: 'https://github.com/microsoft/playwright-mcp#readme', mcp: { kind: 'npx', name: 'playwright', pkg: '@playwright/mcp@latest' } },
  'supabase-mcp': { docs: 'https://supabase.com/docs/guides/getting-started/mcp', mcp: { kind: 'remote', name: 'supabase', url: 'https://mcp.supabase.com/mcp' } },
  'mcp-servers-reference': { docs: 'https://github.com/modelcontextprotocol/servers#readme' },
  'awesome-mcp-servers': { docs: 'https://github.com/punkpeye/awesome-mcp-servers#readme' },
  'mcp-typescript-sdk': { docs: 'https://github.com/modelcontextprotocol/typescript-sdk#readme', commands: { generic: '# 서버\nnpm install @modelcontextprotocol/server\n# 클라이언트\nnpm install @modelcontextprotocol/client' } },
  // ---- CLI ----
  aider: { docs: 'https://aider.chat/docs/install.html', commands: { generic: 'python -m pip install aider-install\naider-install' } },
  'claude-code': { docs: 'https://docs.anthropic.com/en/docs/claude-code/setup', commands: { generic: 'curl -fsSL https://claude.ai/install.sh | bash\n# 또는\nnpm install -g @anthropic-ai/claude-code' } },
  'gemini-cli': { docs: 'https://github.com/google-gemini/gemini-cli#readme', commands: { generic: 'npm install -g @google/gemini-cli\n# 또는\nbrew install gemini-cli' } },
  'openai-codex': { docs: 'https://github.com/openai/codex#readme', commands: { generic: 'npm install -g @openai/codex\n# 또는\nbrew install --cask codex' } },
  ollama: { docs: 'https://ollama.com/download', commands: { generic: '# macOS · Windows: https://ollama.com/download 에서 앱 설치\n# Linux\ncurl -fsSL https://ollama.com/install.sh | sh' } },
  dspy: { docs: 'https://dspy.ai', commands: { generic: 'pip install dspy' } },
  'vercel-next.js': { docs: 'https://nextjs.org/docs/app/getting-started/installation', commands: { generic: 'npx create-next-app@latest' } },
  // ---- 스킬 ----
  'anthropic-skills': { docs: 'https://github.com/anthropics/skills#readme', commands: { claude_code: '/plugin marketplace add anthropics/skills\n/plugin install document-skills@anthropic-agent-skills' } },
  'anthropic-courses': { docs: 'https://github.com/anthropics/courses#readme' },
  // ---- 서비스 ----
  'vercel-ai-sdk': { docs: 'https://ai-sdk.dev/docs/getting-started', commands: { generic: 'npm install ai' } },
  continue: { docs: 'https://docs.continue.dev' },
}

export function verifiedSnippets(slug: string): { snippets: Snippets; docs: string } | null {
  const v = VERIFIED_INSTALLS[slug]
  if (!v) return null
  return { snippets: { ...(v.mcp ? mcpSnippets(v.mcp) : {}), ...(v.commands ?? {}) }, docs: v.docs }
}

/**
 * What the detail page may render: tabs only for environments with their OWN snippet (no
 * fallback copies of one command into every tab); nothing unless the entry is verified.
 */
export function renderableInstall(entry: { install_verified?: boolean | null; install_snippets?: Snippets | null }): { tabs: (ToolboxEnvironment | 'generic')[]; snippets: Snippets } {
  if (!entry.install_verified) return { tabs: [], snippets: {} }
  const s = entry.install_snippets ?? {}
  const keys = (Object.keys(s) as (ToolboxEnvironment | 'generic')[]).filter((k) => typeof s[k] === 'string' && s[k]!.trim())
  const specific = keys.filter((k) => k !== 'generic')
  return { tabs: specific.length ? [...specific, ...(keys.includes('generic') && specific.length > 1 ? ['generic' as const] : [])] : keys, snippets: s }
}

/**
 * One install answer for APIs / MCP / CLI: the environment's own snippet, else the generic one
 * (labelled as generic), and nothing at all unless verified. Always carries the official link.
 */
export function installAnswer(
  entry: { name: string; canonical_url: string; homepage_url?: string | null; github_url?: string | null; install_verified?: boolean | null; install_snippets?: Snippets | null },
  environment: ToolboxEnvironment | 'generic'
): { verified: boolean; environment: ToolboxEnvironment | 'generic'; snippet: string | null; officialUrl: string; note: string | null } {
  const officialUrl = entry.homepage_url || entry.github_url || entry.canonical_url
  const s = entry.install_verified ? entry.install_snippets ?? {} : {}
  const own = s[environment]
  const snippet = own || s.generic || null
  return {
    verified: Boolean(snippet),
    environment: own ? environment : 'generic',
    snippet,
    officialUrl,
    note: snippet ? null : `검증된 설치 명령이 아직 없어요. 공식 설치 안내를 따르세요: ${officialUrl}`,
  }
}
