import { NextRequest, NextResponse } from 'next/server'
import { CORS, NO_STORE, redirectUriOk } from '@/lib/oauth/core'
import { registerClient } from '@/lib/data/oauth'

const err = (error: string, error_description: string, status = 400) =>
  NextResponse.json({ error, error_description }, { status, headers: { ...CORS, ...NO_STORE } })
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** RFC 7591 dynamic client registration. Public clients only: no secret is issued (PKCE protects the code). */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return err('invalid_client_metadata', 'Body must be JSON client metadata.')
  }
  const uris = body.redirect_uris
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 10 || !uris.every(redirectUriOk)) {
    return err('invalid_redirect_uri', 'redirect_uris: 1-10 URIs; https, http on localhost/127.0.0.1, or an app scheme; no fragments.')
  }
  const grants = Array.isArray(body.grant_types) ? (body.grant_types as unknown[]) : ['authorization_code']
  if (grants.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) return err('invalid_client_metadata', 'grant_types: authorization_code and refresh_token only.')
  const types = Array.isArray(body.response_types) ? (body.response_types as unknown[]) : ['code']
  if (types.some((t) => t !== 'code')) return err('invalid_client_metadata', 'response_types: code only.')
  const clientUri = str(body.client_uri, 300)
  const r = await registerClient({
    name: str(body.client_name, 80) ?? 'MCP client',
    redirectUris: uris as string[],
    clientUri: clientUri && /^https:\/\//.test(clientUri) ? clientUri : null,
    softwareId: str(body.software_id, 120),
    softwareVersion: str(body.software_version, 60),
  })
  if ('error' in r) return r.error === 'rate_limited' ? err('temporarily_unavailable', 'Too many registrations right now; try again later.', 429) : err('invalid_redirect_uri', 'Redirect URIs were rejected.')
  return NextResponse.json(
    {
      client_id: r.clientId,
      client_id_issued_at: r.issuedAt,
      client_name: str(body.client_name, 80) ?? 'MCP client',
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      ...(clientUri ? { client_uri: clientUri } : {}),
    },
    { status: 201, headers: { ...CORS, ...NO_STORE } }
  )
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
