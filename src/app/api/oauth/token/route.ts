import { NextRequest, NextResponse } from 'next/server'
import { originFrom, ACCESS_TTL_S, CORS, NO_STORE, REFRESH_TTL_S, newAccessToken, newSecret, readParams, resourceOk, s256, sha256Hex, verifierOk } from '@/lib/oauth/core'
import { exchangeCode, refreshGrant, type GrantResult } from '@/lib/data/oauth'

const err = (error: string, error_description: string, status = 400) =>
  NextResponse.json({ error, error_description }, { status, headers: { ...CORS, ...NO_STORE } })

/** OAuth 2.1 token endpoint: authorization_code (+ PKCE) and refresh_token (rotating, one-time). */
export async function POST(request: NextRequest) {
  const p = await readParams(request)
  const clientId = p.client_id
  if (!clientId) return err('invalid_client', 'client_id is required (public client).', 401)
  if (!resourceOk(p.resource, originFrom(request.headers))) return err('invalid_target', 'resource must be this MCP server.')

  const access = newAccessToken()
  const refresh = newSecret('aisubal_rt_')
  const fresh = { accessHash: access.hash, accessPrefix: access.prefix, refreshHash: refresh.hash, accessTtl: ACCESS_TTL_S, refreshTtl: REFRESH_TTL_S }
  let r: GrantResult
  try {
    if (p.grant_type === 'authorization_code') {
      if (!p.code || !p.redirect_uri) return err('invalid_request', 'code and redirect_uri are required.')
      if (!verifierOk(p.code_verifier)) return err('invalid_request', 'code_verifier (PKCE, 43-128 chars) is required.')
      r = await exchangeCode({ codeHash: sha256Hex(p.code), clientId, redirectUri: p.redirect_uri, challenge: s256(p.code_verifier), ...fresh })
    } else if (p.grant_type === 'refresh_token') {
      if (!p.refresh_token) return err('invalid_request', 'refresh_token is required.')
      r = await refreshGrant({ oldRefreshHash: sha256Hex(p.refresh_token), clientId, ...fresh })
    } else {
      return err('unsupported_grant_type', 'Use authorization_code or refresh_token.')
    }
  } catch (e) {
    console.error('oauth token error:', e)
    return err('server_error', 'Try again.', 500)
  }
  if ('error' in r) return err('invalid_grant', 'The code or refresh token is invalid, expired, or already used.')
  return NextResponse.json(
    { access_token: access.raw, token_type: 'Bearer', expires_in: r.expiresIn, refresh_token: refresh.raw, scope: r.scope },
    { headers: { ...CORS, ...NO_STORE } }
  )
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
