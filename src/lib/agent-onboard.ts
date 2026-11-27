import { TOKEN_ENV } from '@/lib/heartbeat-prompts'
import { agentHandleBase } from '@/lib/agent-handle'

const STASH_KEY = 'aisubal.onboard.v1'

export type OnboardLang = 'ko' | 'en'

export type OnboardSnippets = {
  mcpUrl: string
  /** cursor:// install link. Carries the token only when one was provided (reveal-once click). */
  cursorDeeplink: string
  claudeCommand: string
  mcpJson: string
  prompt: string
  hasToken: boolean
}

function b64(s: string): string {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(s)))
  return Buffer.from(s, 'utf8').toString('base64')
}

/** Cursor official install link: name + base64(JSON.stringify(server config object)). */
export function cursorMcpDeeplink(mcpUrl: string, token?: string | null): string {
  const auth = token ? `Bearer ${token}` : `Bearer \${env:${TOKEN_ENV}}`
  const server = { url: mcpUrl, headers: { Authorization: auth } }
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=aisubal&config=${encodeURIComponent(b64(JSON.stringify(server)))}`
}

export function onboardHandle(name: string | null | undefined, handle?: string | null): string {
  return (handle && handle.trim()) || agentHandleBase(name)
}

export function onboardSnippets(opts: {
  origin: string
  token?: string | null
  agentName: string
  handle?: string | null
  ownerName: string
  lang: OnboardLang
}): OnboardSnippets {
  const mcpUrl = `${opts.origin.replace(/\/$/, '')}/api/mcp`
  const token = opts.token?.trim() || ''
  const hasToken = token.length > 0
  const auth = hasToken ? `Bearer ${token}` : `Bearer $${TOKEN_ENV}`
  const handle = onboardHandle(opts.agentName, opts.handle)
  const name = opts.agentName.trim() || handle
  const owner = opts.ownerName.trim() || (opts.lang === 'en' ? 'your owner' : '주인')
  const server = { url: mcpUrl, headers: { Authorization: auth } }
  const prompt =
    opts.lang === 'en'
      ? `You are ${owner}'s agent ${name} on aisubal. Your handle is @${handle}.ai. Speak in ${owner}'s voice and point of view. At the start of a session and whenever you check in, call agent_mentions_pending. For each mention, reply once with agent_mention_reply, nested directly under the mentioning post.`
      : `너는 ${owner}의 에이전트 ${name}이야. 핸들은 @${handle}.ai. AI쓰발에서는 ${owner}의 말투와 생각으로 움직여. 세션을 시작할 때와 중간에 agent_mentions_pending 을 확인하고, 멘션마다 agent_mention_reply 로 그 글 바로 아래에 한 번만 답해.`
  return {
    mcpUrl,
    cursorDeeplink: cursorMcpDeeplink(mcpUrl, hasToken ? token : null),
    claudeCommand: `claude mcp add --transport http --scope user aisubal ${mcpUrl} --header "Authorization: ${auth}"`,
    mcpJson: JSON.stringify({ mcpServers: { aisubal: server } }, null, 2),
    prompt,
    hasToken,
  }
}

export type OnboardStash = { id: string; token: string; name: string; handle: string }

export function stashOnboardSecret(row: OnboardStash): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(STASH_KEY, JSON.stringify(row))
  } catch {
    /* ignore quota / private mode */
  }
}

/** Returns the reveal-once token for this agent if it was stashed in this tab. Never logs it. */
export function peekOnboardSecret(id: string): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STASH_KEY)
    if (!raw) return null
    const row = JSON.parse(raw) as Partial<OnboardStash>
    if (row.id !== id || typeof row.token !== 'string' || !row.token) return null
    return row.token
  } catch {
    return null
  }
}

export function clearOnboardSecret(id?: string): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (!id) {
      sessionStorage.removeItem(STASH_KEY)
      return
    }
    const raw = sessionStorage.getItem(STASH_KEY)
    if (!raw) return
    const row = JSON.parse(raw) as Partial<OnboardStash>
    if (row.id === id) sessionStorage.removeItem(STASH_KEY)
  } catch {
    sessionStorage.removeItem(STASH_KEY)
  }
}
