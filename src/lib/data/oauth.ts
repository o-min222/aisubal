import { createAnonClient } from '@/lib/supabase/anon'
import { brandFromText } from '@/lib/agent-brand'
import { sb, isMock } from './client'

/** A66 P4: OAuth storage (0115). Every call goes through SECURITY DEFINER RPCs; dev uses an in-memory store. */
export type OAuthClient = { clientId: string; name: string; redirectUris: string[]; clientUri: string | null; createdAt: string }
export type Grant = { tokenId: string; scope: string; expiresIn: number }
export type GrantResult = Grant | { error: 'invalid_grant' }

type MockCode = { clientId: string; redirectUri: string; challenge: string; scopes: string[]; agentName: string; tokenId: string | null; exp: number; used: boolean }
type MockStore = {
  clients: Map<string, OAuthClient>
  codes: Map<string, MockCode>
  refresh: Map<string, { tokenId: string; clientId: string; used: boolean; scopes: string }>
  agents: Map<string, { name: string; clientId: string; access: string; scopes: string[] }>
}
const g = globalThis as unknown as { __aisubalOAuth?: MockStore }
const mock = (): MockStore => (g.__aisubalOAuth ??= { clients: new Map(), codes: new Map(), refresh: new Map(), agents: new Map() })

/** dev only: agents created through the mock OAuth flow (shown in 내 에이전트) */
export const mockOAuthAgents = () => [...mock().agents.entries()].map(([id, a]) => ({ id, name: a.name, scopes: a.scopes, oauthClientName: mock().clients.get(a.clientId)?.name ?? null }))

export async function registerClient(c: { name: string; redirectUris: string[]; clientUri?: string | null; softwareId?: string | null; softwareVersion?: string | null }): Promise<{ clientId: string; issuedAt: number } | { error: string }> {
  if (isMock()) {
    const clientId = `aisubal-${crypto.randomUUID().replace(/-/g, '')}`
    mock().clients.set(clientId, { clientId, name: c.name || 'MCP client', redirectUris: c.redirectUris, clientUri: c.clientUri ?? null, createdAt: new Date().toISOString() })
    return { clientId, issuedAt: Math.floor(Date.now() / 1000) }
  }
  const { data, error } = await createAnonClient().rpc('oauth_client_register', {
    p_name: c.name, p_redirect_uris: c.redirectUris, p_client_uri: c.clientUri ?? null, p_software_id: c.softwareId ?? null, p_software_version: c.softwareVersion ?? null,
  })
  if (error) return { error: error.message.includes('rate_limited') ? 'rate_limited' : 'invalid_redirect_uri' }
  const d = data as { clientId: string; issuedAt: number }
  return { clientId: d.clientId, issuedAt: Number(d.issuedAt) }
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  if (!clientId || clientId.length > 80) return null
  if (isMock()) return mock().clients.get(clientId) ?? null
  const { data, error } = await createAnonClient().rpc('oauth_client_get', { p_client_id: clientId })
  if (error || !data) return null
  const d = data as Record<string, unknown>
  return { clientId: String(d.clientId), name: String(d.name), redirectUris: (d.redirectUris as string[]) ?? [], clientUri: (d.clientUri as string) ?? null, createdAt: String(d.createdAt) }
}

/**
 * The member's agents already connected through this client, or through an earlier registration of the same app
 * (Orca, Cursor… register a fresh client_id on every connect): consent screen "reconnect" instead of a new agent.
 */
export async function myOAuthAgents(memberId: string, clientId: string): Promise<{ id: string; name: string; lastUsedAt: string | null; avatarUrl?: string | null; brand?: string | null }[]> {
  if (isMock()) {
    const name = mock().clients.get(clientId)?.name.toLowerCase()
    return [...mock().agents.entries()]
      .filter(([, a]) => a.clientId === clientId || (name != null && mock().clients.get(a.clientId)?.name.toLowerCase() === name))
      .map(([id, a]) => ({ id, name: a.name, lastUsedAt: null, brand: brandFromText(mock().clients.get(a.clientId)?.name) }))
  }
  void memberId // the RPC reads the member from the session
  const s = await sb()
  const { data } = await s.rpc('oauth_my_agents', { p_client_id: clientId })
  return ((data ?? []) as { id: string; name: string; last_used_at: string | null; avatar_url: string | null; brand: string | null }[]).map((t) => ({ id: t.id, name: t.name, lastUsedAt: t.last_used_at, avatarUrl: t.avatar_url, brand: t.brand }))
}

export async function createCode(p: { codeHash: string; clientId: string; redirectUri: string; challenge: string; scopes: string[]; agentName: string; tokenId: string | null; resource: string | null }): Promise<{ ok: true } | { error: string }> {
  if (isMock()) {
    mock().codes.set(p.codeHash, { clientId: p.clientId, redirectUri: p.redirectUri, challenge: p.challenge, scopes: p.scopes, agentName: p.agentName, tokenId: p.tokenId, exp: Date.now() + 600_000, used: false })
    return { ok: true }
  }
  const s = await sb()
  const { error } = await s.rpc('oauth_code_create', {
    p_code_hash: p.codeHash, p_client_id: p.clientId, p_redirect_uri: p.redirectUri, p_challenge: p.challenge,
    p_scopes: p.scopes, p_agent_name: p.agentName, p_token_id: p.tokenId, p_resource: p.resource,
  })
  if (error) return { error: error.message.match(/invalid_scope|invalid_client|invalid_redirect_uri|token_not_found|authorize_rate_limited|not_authenticated/)?.[0] ?? 'server_error' }
  return { ok: true }
}

type Fresh = { accessHash: string; accessPrefix: string; refreshHash: string; accessTtl: number; refreshTtl: number }

export async function exchangeCode(p: { codeHash: string; clientId: string; redirectUri: string; challenge: string } & Fresh): Promise<GrantResult> {
  if (isMock()) {
    const m = mock()
    const c = m.codes.get(p.codeHash)
    if (!c || c.used || c.exp < Date.now() || c.clientId !== p.clientId || c.redirectUri !== p.redirectUri || c.challenge !== p.challenge) return { error: 'invalid_grant' }
    c.used = true
    const tokenId = c.tokenId ?? `token-oauth-${m.agents.size + 1}`
    m.agents.set(tokenId, { name: c.agentName, clientId: c.clientId, access: p.accessHash, scopes: c.scopes })
    m.refresh.set(p.refreshHash, { tokenId, clientId: c.clientId, used: false, scopes: c.scopes.join(' ') })
    return { tokenId, scope: c.scopes.join(' '), expiresIn: p.accessTtl }
  }
  const { data, error } = await createAnonClient().rpc('oauth_token_exchange', {
    p_code_hash: p.codeHash, p_client_id: p.clientId, p_redirect_uri: p.redirectUri, p_verifier_challenge: p.challenge,
    p_access_hash: p.accessHash, p_access_prefix: p.accessPrefix, p_refresh_hash: p.refreshHash, p_access_ttl: p.accessTtl, p_refresh_ttl: p.refreshTtl,
  })
  if (error) throw new Error(error.message)
  return data as GrantResult
}

export async function refreshGrant(p: { oldRefreshHash: string; clientId: string } & Fresh): Promise<GrantResult> {
  if (isMock()) {
    const m = mock()
    const r = m.refresh.get(p.oldRefreshHash)
    if (!r || r.used || r.clientId !== p.clientId) return { error: 'invalid_grant' }
    r.used = true
    m.refresh.set(p.refreshHash, { ...r, used: false })
    const a = m.agents.get(r.tokenId)
    if (a) a.access = p.accessHash
    return { tokenId: r.tokenId, scope: r.scopes, expiresIn: p.accessTtl }
  }
  const { data, error } = await createAnonClient().rpc('oauth_token_refresh', {
    p_refresh_hash: p.oldRefreshHash, p_client_id: p.clientId, p_access_hash: p.accessHash, p_access_prefix: p.accessPrefix,
    p_new_refresh_hash: p.refreshHash, p_access_ttl: p.accessTtl, p_refresh_ttl: p.refreshTtl,
  })
  if (error) throw new Error(error.message)
  return data as GrantResult
}

export async function revokeToken(hash: string, clientId: string): Promise<void> {
  if (isMock()) {
    const r = mock().refresh.get(hash)
    if (r && r.clientId === clientId) r.used = true
    return
  }
  await createAnonClient().rpc('oauth_revoke', { p_hash: hash, p_client_id: clientId })
}

/** /api/mcp on every non-handshake request: is the bearer usable right now? */
export async function tokenUsable(token: string): Promise<boolean> {
  const { data, error } = await createAnonClient().rpc('mcp_token_check', { p_token: token })
  return error ? true : data === true // fail open on a DB hiccup: the tool RPCs re-check the token anyway
}
