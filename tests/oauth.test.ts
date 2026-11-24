import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import {
  ALL_SCOPES, authorizationServerMetadata, clientRedirect, grantScopes, protectedResourceMetadata, redirectUriOk, requestedWrites, resourceOk, s256, wwwAuthenticate,
} from '@/lib/oauth/core'
import { CONSENT_DO } from '@/lib/oauth/consent-copy'
import en from '@/i18n/dict/en'
import * as copy from '@/lib/oauth/consent-copy'

const O = 'https://aisubal.vercel.app'

describe('A66 P4 OAuth core', () => {
  it('PKCE S256 matches RFC 7636 appendix B', () => {
    expect(s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  it('redirect URIs: https, loopback http, app schemes; nothing that runs or leaks', () => {
    for (const ok of ['https://claude.ai/api/mcp/auth_callback', 'http://127.0.0.1:33418/callback', 'http://localhost:6274/oauth/callback', 'cursor://anysphere.cursor-retrieval/oauth/callback', 'vscode://x/cb']) expect(redirectUriOk(ok), ok).toBe(true)
    for (const bad of ['http://evil.example/cb', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'https://a.example/cb#frag', 'not a url', 42]) expect(redirectUriOk(bad), String(bad)).toBe(false)
  })
  it('scopes: reads always granted; writes as checked; review only for admins', () => {
    expect(requestedWrites(null, false)).toEqual(['agora:write', 'feed:interact', 'archive:write', 'tools:submit'])
    expect(requestedWrites('posts_read agora:write', false)).toEqual(['agora:write'])
    expect(requestedWrites('tools:review', false)).toEqual(['tools:submit'])
    expect(requestedWrites('tools:review', true)).toEqual(['tools:submit', 'tools:review'])
    expect(grantScopes(['agora:write', 'tools:review', 'bogus'], false)).toEqual(['posts_read', 'meetups_read', 'toolbox_read', 'archive:read', 'agora:read', 'agora:write'])
    expect(grantScopes(['tools:review'], true)).toContain('tools:review')
  })
  it('metadata, resource and the 401 challenge point at each other', () => {
    const as = authorizationServerMetadata(O)
    const pr = protectedResourceMetadata(O)
    expect(pr.authorization_servers).toEqual([as.issuer])
    expect(pr.resource).toBe(`${O}/api/mcp`)
    expect(as.code_challenge_methods_supported).toEqual(['S256'])
    expect(as.token_endpoint_auth_methods_supported).toEqual(['none'])
    expect(as.scopes_supported).toEqual([...ALL_SCOPES])
    expect(wwwAuthenticate(O, false)).toBe(`Bearer resource_metadata="${O}/.well-known/oauth-protected-resource/api/mcp"`)
    expect(wwwAuthenticate(O, true)).toMatch(/error="invalid_token"$/)
    expect(resourceOk(`${O}/api/mcp/`, O) && resourceOk(O, O) && resourceOk(null, O)).toBe(true)
    expect(resourceOk('https://other.example/api/mcp', O)).toBe(false)
    expect(clientRedirect('http://127.0.0.1:1/cb?x=1', O, { code: 'c', state: null })).toBe(`http://127.0.0.1:1/cb?x=1&code=c&iss=${encodeURIComponent(O)}`)
  })
  it('consent wording: every line has an English translation and every write scope a line', () => {
    const lines = [...Object.values(copy.CONSENT), ...copy.CONSENT_SEE, ...Object.values(copy.CONSENT_DO), ...copy.CONSENT_CANNOT, ...Object.values(copy.CONSENT_ERRORS)]
    for (const l of lines) expect((en as Record<string, string>)[l], l).toBeTruthy()
    expect(Object.keys(CONSENT_DO).sort()).toEqual(['agora:write', 'archive:write', 'feed:interact', 'tools:review', 'tools:submit'])
  })
  it('migration 0115: tables closed, codes only for signed-in members, every token check knows access expiry', () => {
    const sql = readFileSync('supabase/migrations/0115_mcp_oauth.sql', 'utf8')
    expect(sql).toMatch(/revoke all on table public\.oauth_clients, public\.oauth_codes, public\.oauth_refresh_tokens from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.oauth_code_create\([^)]*\) to authenticated;/)
    expect(sql).toMatch(/revoke execute on function public\.oauth_code_create\([^)]*\) from anon;/)
    for (const fn of ['api__token', 'api__token_any', 'agora__token', 'mcp_ping', 'mcp_token_scopes', 'mcp_usage_begin']) {
      const body = sql.split(`FUNCTION public.${fn}(`)[1]?.split('$function$;')[0] ?? ''
      expect(body, fn).toMatch(/access_expires_at IS NOT NULL AND t\.access_expires_at < NOW\(\)/)
    }
    // grant failures return (not raise) so a replay's revocation is kept
    expect(sql.split('function public.oauth_token_exchange(')[1].split('end $$;')[0]).not.toMatch(/raise exception 'invalid_grant'/)
  })
})

/** the whole flow against the dev server (DEV_BYPASS_AUTH: in-memory store, dev member signed in) */
const B = process.env.TEST_BASE_URL || 'http://127.0.0.1:43256'
const form = (p: Record<string, string>) => new URLSearchParams(p)

describe('A66 P4 OAuth flow (dev server)', () => {
  it('register → consent → code → token → refresh (rotating) → revoke', async () => {
    const meta = await (await fetch(`${B}/.well-known/oauth-authorization-server`)).json()
    expect(meta.registration_endpoint).toBe(`${meta.issuer}/api/oauth/register`)
    const redirect = 'http://127.0.0.1:33418/callback'
    const reg = await fetch(`${B}/api/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Test Client', redirect_uris: [redirect] }) })
    expect(reg.status).toBe(201)
    const client = await reg.json()
    expect(client.token_endpoint_auth_method).toBe('none')

    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const q = form({ response_type: 'code', client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 'abc', scope: 'agora:write' })
    const html = await (await fetch(`${B}/oauth/authorize?${q}`)).text()
    expect(html).toContain('value="allow"')

    const fields = form({ client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, state: 'abc', agent_name: 'Test Agent', token_id: '', decision: 'allow', scope_write: 'agora:write' })
    expect((await fetch(`${B}/api/oauth/authorize`, { method: 'POST', redirect: 'manual', headers: { origin: 'https://evil.example' }, body: fields })).status).toBe(403)
    const allow = await fetch(`${B}/api/oauth/authorize`, { method: 'POST', redirect: 'manual', headers: { origin: B }, body: fields })
    expect(allow.status).toBe(303)
    const loc = new URL(allow.headers.get('location')!)
    expect(loc.searchParams.get('state')).toBe('abc')
    expect(loc.searchParams.get('iss')).toBe(meta.issuer)
    const code = loc.searchParams.get('code')!

    const token = (p: Record<string, string>) => fetch(`${B}/api/oauth/token`, { method: 'POST', body: form(p) })
    expect((await (await token({ grant_type: 'authorization_code', client_id: client.client_id, code, redirect_uri: redirect, code_verifier: 'x'.repeat(43) })).json()).error).toBe('invalid_grant')
    const t1 = await (await token({ grant_type: 'authorization_code', client_id: client.client_id, code, redirect_uri: redirect, code_verifier: verifier })).json()
    expect(t1).toMatchObject({ token_type: 'Bearer', expires_in: 3600 })
    expect(t1.access_token).toMatch(/^aisubal_[0-9a-f]{48}$/)
    expect(t1.scope.split(' ')).toEqual(expect.arrayContaining(['posts_read', 'agora:read', 'agora:write']))
    expect(t1.scope).not.toContain('feed:interact')
    expect((await (await token({ grant_type: 'authorization_code', client_id: client.client_id, code, redirect_uri: redirect, code_verifier: verifier })).json()).error).toBe('invalid_grant')

    const t2 = await (await token({ grant_type: 'refresh_token', client_id: client.client_id, refresh_token: t1.refresh_token })).json()
    expect(t2.access_token).not.toBe(t1.access_token)
    expect((await (await token({ grant_type: 'refresh_token', client_id: client.client_id, refresh_token: t1.refresh_token })).json()).error).toBe('invalid_grant')
    expect((await fetch(`${B}/api/oauth/revoke`, { method: 'POST', body: form({ client_id: client.client_id, token: t2.refresh_token }) })).status).toBe(200)
    expect((await (await token({ grant_type: 'refresh_token', client_id: client.client_id, refresh_token: t2.refresh_token })).json()).error).toBe('invalid_grant')
  })
  it('the authorize request is checked before anything else', async () => {
    expect(await (await fetch(`${B}/oauth/authorize?client_id=aisubal-nope&response_type=code`)).text()).toContain('role="alert"')
    const bad = await fetch(`${B}/api/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['http://evil.example/cb'] }) })
    expect(bad.status).toBe(400)
    expect((await (await fetch(`${B}/api/oauth/token`, { method: 'POST', body: form({ grant_type: 'password', client_id: 'x' }) })).json()).error).toBe('unsupported_grant_type')
  })
})
