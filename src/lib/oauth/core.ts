import { createHash, randomBytes } from 'crypto'

/**
 * A66 P4: OAuth 2.1 for MCP clients (MCP authorization spec 2025-06-18).
 *  - authorization code + PKCE (S256 only), public clients (token_endpoint_auth_method "none")
 *  - dynamic client registration (RFC 7591), metadata (RFC 8414, RFC 9728), revocation (RFC 7009)
 *  - one agent record per authorization: the access token is that api_tokens row's token (rotated on refresh)
 * Pasted tokens from 내 AI 연결하기 keep working unchanged.
 */
export const ACCESS_TTL_S = 60 * 60 // 1 hour
export const REFRESH_TTL_S = 90 * 24 * 60 * 60 // 90 days, one-time use (rotated)
export const MCP_PATH = '/api/mcp'

/** every scope a member may grant (tools:review is offered to admins only) */
export const READ_SCOPES = ['posts_read', 'meetups_read', 'toolbox_read', 'archive:read', 'agora:read'] as const
export const WRITE_SCOPES = ['agora:write', 'feed:interact', 'archive:write', 'tools:submit', 'article:write'] as const
export const ADMIN_SCOPES = ['tools:review'] as const
export const ALL_SCOPES = [...READ_SCOPES, ...WRITE_SCOPES, ...ADMIN_SCOPES] as const
export type OAuthScope = (typeof ALL_SCOPES)[number]
const isScope = (s: string): s is OAuthScope => (ALL_SCOPES as readonly string[]).includes(s)

/**
 * Which write scopes to pre-check on the consent screen: the requested ones, or (no scope asked for)
 * every member write scope. Reads are always granted; tools:review only when an admin's client asks for it.
 */
export function requestedWrites(scope: string | null | undefined, isAdmin: boolean): OAuthScope[] {
  const asked = (scope ?? '').split(/\s+/).filter(isScope)
  const offer: OAuthScope[] = [...WRITE_SCOPES, ...(isAdmin ? ADMIN_SCOPES : [])]
  if (asked.length === 0) return [...WRITE_SCOPES]
  return offer.filter((s) => asked.includes(s) || (s === 'tools:submit' && asked.includes('tools:review')))
}

/** final grant: all reads + the checked writes that this member may grant */
export function grantScopes(checked: string[], isAdmin: boolean): OAuthScope[] {
  const offer: string[] = [...WRITE_SCOPES, ...(isAdmin ? ADMIN_SCOPES : [])]
  return [...READ_SCOPES, ...offer.filter((s) => checked.includes(s))] as OAuthScope[]
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const BAD_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:', 'ftp:', 'ws:', 'wss:'])

/** OAuth 2.1 redirect URIs: https, http only on loopback, or a native app's private scheme (cursor://, vscode://…). */
export function redirectUriOk(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 500 || raw.includes('#')) return false
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (BAD_SCHEMES.has(u.protocol)) return false
  if (u.protocol === 'https:') return Boolean(u.hostname)
  if (u.protocol === 'http:') return LOOPBACK.has(u.hostname)
  // private-use scheme: reverse-DNS-ish or app name, no credentials
  return /^[a-z][a-z0-9+.-]{1,40}:$/.test(u.protocol) && !u.username && !u.password
}

/** where a redirect goes, for the consent screen (host, or the app scheme) */
export function redirectLabel(uri: string): string {
  try {
    const u = new URL(uri)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.host : u.protocol.replace(/:$/, '')
  } catch {
    return uri
  }
}

export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex')
/** PKCE S256: BASE64URL(SHA256(code_verifier)) */
export const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')
export const verifierOk = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(v)
export const challengeOk = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v)

/** same shape as a pasted token, so every existing check and the CLI accept it */
export function newAccessToken() {
  const raw = `aisubal_${randomBytes(24).toString('hex')}`
  return { raw, hash: sha256Hex(raw), prefix: raw.slice(0, 12) }
}
export function newSecret(prefix: string) {
  const raw = `${prefix}${randomBytes(32).toString('base64url')}`
  return { raw, hash: sha256Hex(raw) }
}

/** the origin the client actually used (Vercel / proxies forward it); issuer, iss and resource all come from this */
export function originFrom(h: Headers): string {
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost').split(',')[0].trim()
  const proto = (h.get('x-forwarded-proto') ?? (/^(localhost|127\.|\[::1\])/.test(host) ? 'http' : 'https')).split(',')[0].trim()
  return `${proto}://${host}`
}

export const resourceUrl = (origin: string) => `${origin}${MCP_PATH}`
export const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`

/** RFC 8707: a client may name the resource; it must be this MCP server */
export function resourceOk(resource: string | null | undefined, origin: string) {
  if (!resource) return true
  const r = resource.replace(/\/+$/, '')
  return r === resourceUrl(origin) || r === origin
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [...ALL_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'AI쓰발 MCP',
    resource_documentation: `${origin}/skill.md`,
  }
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...ALL_SCOPES],
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/skill.md`,
  }
}

/** the 401 challenge on /api/mcp: tells MCP clients where to start OAuth */
export function wwwAuthenticate(origin: string, invalidToken: boolean) {
  return `Bearer resource_metadata="${resourceMetadataUrl(origin)}"${invalidToken ? ', error="invalid_token"' : ''}`
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
}
export const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

/** a redirect back to the client (success or error), always with state and iss (RFC 9207) */
export function clientRedirect(redirectUri: string, origin: string, params: Record<string, string | null | undefined>) {
  const u = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v)
  u.searchParams.set('iss', origin)
  return u.toString()
}

/** Body of a token / revoke request: form-encoded per spec, JSON tolerated. */
export async function readParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? ''
  const text = await req.text().catch(() => '')
  if (text.length > 8000) return {}
  if (type.includes('application/json')) {
    try {
      const j = JSON.parse(text) as Record<string, unknown>
      return Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === 'string')) as Record<string, string>
    } catch {
      return {}
    }
  }
  const out: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(text)) out[k] = v
  // a client that registered as public but still sends Basic credentials: take its client_id from there
  const basic = req.headers.get('authorization')
  if (!out.client_id && basic?.startsWith('Basic ')) {
    try {
      out.client_id = decodeURIComponent(Buffer.from(basic.slice(6), 'base64').toString('utf8').split(':')[0] ?? '')
    } catch {}
  }
  return out
}
