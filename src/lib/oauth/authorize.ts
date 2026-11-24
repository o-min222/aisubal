import { getClient, type OAuthClient } from '@/lib/data/oauth'
import { challengeOk, clientRedirect, resourceOk } from './core'

export type AuthorizeRequest = { client: OAuthClient; redirectUri: string; state: string | null; challenge: string; scope: string | null; resource: string | null }
export type AuthorizeCheck =
  | { kind: 'ok'; req: AuthorizeRequest }
  /** never redirect to an unverified place: show an error page instead */
  | { kind: 'fatal'; reason: 'unknown_client' | 'bad_redirect' }
  | { kind: 'redirect'; url: string }

const one = (v: string | string[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null

/** RFC 6749 4.1.2.1 order: client and redirect_uri first (fatal), then everything else goes back to the client. */
export async function checkAuthorize(q: Record<string, string | string[] | undefined | null>, origin: string): Promise<AuthorizeCheck> {
  const clientId = one(q.client_id)
  const client = clientId ? await getClient(clientId) : null
  if (!client) return { kind: 'fatal', reason: 'unknown_client' }
  const asked = one(q.redirect_uri)
  const redirectUri = asked ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null)
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) return { kind: 'fatal', reason: 'bad_redirect' }
  const state = one(q.state)
  const back = (error: string, description: string) => ({ kind: 'redirect' as const, url: clientRedirect(redirectUri, origin, { error, error_description: description, state }) })
  if (one(q.response_type) !== 'code') return back('unsupported_response_type', 'response_type must be code')
  const challenge = one(q.code_challenge)
  if (!challengeOk(challenge) || (one(q.code_challenge_method) ?? 'plain') !== 'S256') return back('invalid_request', 'PKCE with code_challenge_method=S256 is required')
  const resource = one(q.resource)
  if (!resourceOk(resource, origin)) return back('invalid_target', 'resource must be this MCP server')
  return { kind: 'ok', req: { client, redirectUri, state, challenge, scope: one(q.scope), resource } }
}
