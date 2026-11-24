/**
 * A69 (Colin, t295u): one agent mark everywhere. The database resolves api_tokens.agent_brand once
 * (0122 agent__brand: self-declared model → connect preset → OAuth software_id / client_name → MCP
 * clientInfo) and every reader returns it; the UI only maps the key to a mark. This file mirrors the
 * SQL patterns for mock data and the connect presets; tests/agent-brand.test.ts keeps the two in sync.
 */
export const AGENT_BRANDS = ['claude', 'cursor', 'codex', 'chatgpt', 'gemini', 'grok_bot', 'grok', 'llama'] as const
export type AgentBrand = (typeof AGENT_BRANDS)[number]

/** order matters (first match wins), same as agent__brand_from_text */
export const BRAND_PATTERNS: ReadonlyArray<readonly [AgentBrand, string]> = [
  ['claude', 'claude|anthropic|sonnet|opus|haiku'],
  ['cursor', 'cursor'],
  ['codex', 'codex'],
  ['chatgpt', 'gpt|openai|chatgpt|o[134]-'],
  ['gemini', 'gemini|google'],
  ['grok_bot', 'grok[[:space:]_-]*bot'],
  ['grok', 'grok|xai'],
  ['llama', 'llama|meta'],
]

export const BRAND_STYLE: Record<AgentBrand, { label: string; bg: string; fg: string; glyph: string }> = {
  claude: { label: 'Claude', bg: '#d97757', fg: '#fff', glyph: '✳' },
  cursor: { label: 'Cursor', bg: '#111', fg: '#fff', glyph: '▲' },
  codex: { label: 'Codex', bg: '#0f0f0f', fg: '#fff', glyph: '›_' },
  chatgpt: { label: 'ChatGPT', bg: '#10a37f', fg: '#fff', glyph: '◎' },
  gemini: { label: 'Gemini', bg: '#1a73e8', fg: '#fff', glyph: '✦' },
  grok_bot: { label: 'Grok Bot', bg: '#000', fg: '#fff', glyph: '𝕏' },
  grok: { label: 'Grok', bg: '#000', fg: '#fff', glyph: '𝕏' },
  llama: { label: 'Llama', bg: '#0866ff', fg: '#fff', glyph: '∞' },
}

/** connect presets (api_tokens.client) → brand, same as agent__brand */
export const CLIENT_BRAND: Record<string, AgentBrand> = {
  claude_desktop: 'claude', claude_code: 'claude', chatgpt: 'chatgpt', chatgpt_desktop: 'chatgpt', cursor: 'cursor', codex: 'codex', grok_bot: 'grok_bot',
}

const RE = BRAND_PATTERNS.map(([b, src]) => [b, new RegExp(src.replace('[[:space:]_-]', '[\\s_-]'), 'i')] as const)

export function brandFromText(s: string | null | undefined): AgentBrand | null {
  if (!s || !s.trim()) return null
  for (const [b, re] of RE) if (re.test(s)) return b
  return null
}

/** TS twin of agent__brand (mock rows only; real rows carry agent_brand) */
export function resolveAgentBrand(a: { model?: string | null; client?: string | null; oauthSoftwareId?: string | null; oauthClientName?: string | null; clientInfo?: string | null }): AgentBrand | null {
  return brandFromText(a.model) ?? (a.client ? CLIENT_BRAND[a.client] ?? null : null) ?? brandFromText(a.oauthSoftwareId) ?? brandFromText(a.oauthClientName) ?? brandFromText(a.clientInfo)
}

/** a brand key from the API (anything else → null: the generic bot) */
export function parseBrand(v: unknown): AgentBrand | null {
  return typeof v === 'string' && (AGENT_BRANDS as readonly string[]).includes(v) ? (v as AgentBrand) : null
}
