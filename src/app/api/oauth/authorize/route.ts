import { NextRequest, NextResponse } from 'next/server'
import { getUserState } from '@/lib/auth'
import { validateAgentName } from '@/lib/agent-connect'
import { checkAuthorize } from '@/lib/oauth/authorize'
import { originFrom, clientRedirect, grantScopes, newSecret } from '@/lib/oauth/core'
import { createCode } from '@/lib/data/oauth'

/** one line per refusal (no secrets, no codes) so a stuck consent screen can be traced in the runtime logs */
const note = (reason: string, extra: Record<string, string | null | undefined> = {}) => console.warn('[oauth] authorize', JSON.stringify({ reason, ...extra }))

const see = (url: string) => NextResponse.redirect(url, { status: 303, headers: { 'Cache-Control': 'no-store' } })

/**
 * A66 P4: the consent form posts here. Same-origin only (the session cookie alone is not enough), then
 * every field is checked again exactly as on the consent page before a one-time code is issued.
 */
export async function POST(request: NextRequest) {
  const origin = originFrom(request.headers)
  const from = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  if ((from && from !== origin) || (!from && site !== 'same-origin')) {
    note('origin', { origin: from, site })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const f = await request.formData().catch(() => null)
  if (!f) return new NextResponse('Bad request', { status: 400 })
  const v = (k: string) => {
    const x = f.get(k)
    return typeof x === 'string' ? x : null
  }
  const q = {
    client_id: v('client_id'), redirect_uri: v('redirect_uri'), state: v('state'), code_challenge: v('code_challenge'),
    code_challenge_method: 'S256', response_type: 'code', resource: v('resource'), scope: v('scope'),
  }
  const check = await checkAuthorize(q, origin)
  if (check.kind === 'redirect') return see(check.url)
  if (check.kind === 'fatal') {
    note(check.reason, { client: q.client_id })
    return see(`${origin}/oauth/authorize?${new URLSearchParams({ client_id: q.client_id ?? '' })}`)
  }
  const { req } = check

  const state = await getUserState()
  if (state.type !== 'member' || !state.member.signup_completed_at || state.member.is_banned) {
    note('not_member', { state: state.type, client: req.client.clientId })
    return new NextResponse('Forbidden', { status: 403 })
  }
  if (v('decision') !== 'allow') return see(clientRedirect(req.redirectUri, origin, { error: 'access_denied', error_description: 'The member declined.', state: req.state }))

  const name = validateAgentName(v('agent_name') ?? '')
  /** back to the same consent screen, scrolled to the buttons where the reason is shown (a refusal must never look like nothing happened) */
  const backToConsent = (hint: string, why: string) => {
    note(why, { client: req.client.clientId })
    const back = new URLSearchParams(Object.entries(q).filter(([, x]) => x != null) as [string, string][])
    back.set('error_hint', hint)
    return see(`${origin}/oauth/authorize?${back}#decision`)
  }
  if (!name.ok) return backToConsent('failed', 'agent_name')
  const tokenId = v('token_id') || null
  const scopes = grantScopes(f.getAll('scope_write').filter((x): x is string => typeof x === 'string'), state.member.is_admin)

  const code = newSecret('ac_')
  const r = await createCode({ codeHash: code.hash, clientId: req.client.clientId, redirectUri: req.redirectUri, challenge: req.challenge, scopes, agentName: name.name, tokenId, resource: req.resource }).catch(() => ({ error: 'server_error' }))
  if ('error' in r) return backToConsent('failed', r.error)
  return see(clientRedirect(req.redirectUri, origin, { code: code.raw, state: req.state }))
}
