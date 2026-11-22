/**
 * Known AI services → their site, so chips can show the real logo (favicon).
 * Logos are fetched server-side through /api/icon/[key] (fixed allowlist, CDN-cached),
 * so viewers' browsers never talk to a third party. Unknown labels get a letter mark.
 */
export type ServiceLogo = { key: string; domain: string }

const SERVICES: Array<ServiceLogo & { match: RegExp }> = [
  { key: 'claude-code', domain: 'claude.com', match: /^claude\s*code/i },
  { key: 'claude', domain: 'claude.ai', match: /^(claude|anthropic)/i },
  { key: 'chatgpt', domain: 'chatgpt.com', match: /^(chat\s*gpt|gpt|openai|custom\s*gpt)/i },
  { key: 'codex', domain: 'openai.com', match: /^codex/i },
  { key: 'gemini', domain: 'gemini.google.com', match: /^(gemini|bard)/i },
  { key: 'notebooklm', domain: 'notebooklm.google.com', match: /^notebook\s*lm/i },
  { key: 'grok', domain: 'grok.com', match: /^(super\s*)?grok/i },
  { key: 'cursor', domain: 'cursor.com', match: /^cursor/i },
  { key: 'perplexity', domain: 'perplexity.ai', match: /^perplexity/i },
  { key: 'copilot', domain: 'github.com', match: /^(github|copilot)/i },
  { key: 'midjourney', domain: 'midjourney.com', match: /^midjourney/i },
  { key: 'v0', domain: 'v0.dev', match: /^v0\b/i },
  { key: 'raycast', domain: 'raycast.com', match: /^raycast/i },
  { key: 'context7', domain: 'context7.com', match: /^context7/i },
  { key: 'playwright', domain: 'playwright.dev', match: /^playwright/i },
  { key: 'chrome', domain: 'developer.chrome.com', match: /^chrome/i },
  { key: 'n8n', domain: 'n8n.io', match: /^n8n/i },
  { key: 'supabase', domain: 'supabase.com', match: /^supabase/i },
  { key: 'vercel', domain: 'vercel.com', match: /^vercel/i },
  { key: 'figma', domain: 'figma.com', match: /^figma/i },
  { key: 'notion', domain: 'notion.so', match: /^notion/i },
  { key: 'linear', domain: 'linear.app', match: /^linear/i },
  { key: 'mistral', domain: 'mistral.ai', match: /^(mistral|le\s*chat)/i },
  { key: 'deepseek', domain: 'deepseek.com', match: /^deepseek/i },
  { key: 'windsurf', domain: 'windsurf.com', match: /^windsurf/i },
  { key: 'replit', domain: 'replit.com', match: /^replit/i },
  { key: 'lovable', domain: 'lovable.dev', match: /^lovable/i },
  { key: 'suno', domain: 'suno.com', match: /^suno/i },
  { key: 'elevenlabs', domain: 'elevenlabs.io', match: /^eleven\s*labs/i },
  { key: 'runway', domain: 'runwayml.com', match: /^runway/i },
]

export function serviceLogo(label: string): ServiceLogo | null {
  const l = label.trim()
  const s = SERVICES.find((x) => x.match.test(l))
  return s ? { key: s.key, domain: s.domain } : null
}

export const serviceDomain = (key: string): string | null => SERVICES.find((s) => s.key === key)?.domain ?? null

export const serviceIconUrl = (label: string): string | null => {
  const s = serviceLogo(label)
  return s ? `/api/icon/${s.key}` : null
}

const HUES = ['#d97757', '#10a37f', '#4f7cff', '#111111', '#8b5cf6', '#e5484d', '#0f766e', '#c2410c']
/** Stable color for the letter-mark fallback. */
export const letterHue = (s: string) => HUES[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length]
