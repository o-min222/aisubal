import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { checkAuthorize } from '@/lib/oauth/authorize'
import { ADMIN_SCOPES, WRITE_SCOPES, originFrom, redirectLabel, requestedWrites } from '@/lib/oauth/core'
import { CONSENT, CONSENT_CANNOT, CONSENT_DO, CONSENT_ERRORS, CONSENT_SEE } from '@/lib/oauth/consent-copy'
import { toolsForScope } from '@/lib/mcp/catalog'
import { myOAuthAgents } from '@/lib/data/oauth'
import { getT } from '@/i18n/server'
import { AgentAvatar } from '@/components/agents/agent-avatar'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('에이전트 연결 · AI쓰발'), robots: { index: false } }
}

async function originOf() {
  return originFrom(await headers())
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="oauth-page min-h-dvh px-4 pt-8 pb-16 sm:pt-16">
      <div className="mx-auto w-full max-w-[480px]">{children}</div>
    </main>
  )
}

/**
 * A66 P4: OAuth consent for MCP clients (Claude, ChatGPT, Cursor…). Signed-out visitors are sent to
 * sign-in by the middleware and come back here with the same query.
 */
export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams
  const origin = await originOf()
  const t = await getT()
  const check = await checkAuthorize(q, origin)
  if (check.kind === 'redirect') redirect(check.url)
  if (check.kind === 'fatal') {
    return (
      <Shell>
        <section className="card p-5 space-y-2" role="alert">
          <h1 className="text-[17px] font-bold text-n-111">{t('연결할 수 없어요')}</h1>
          <p className="text-sm text-n-666">{t(CONSENT_ERRORS[check.reason])}</p>
        </section>
      </Shell>
    )
  }
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/?next=' + encodeURIComponent('/oauth/authorize?' + new URLSearchParams(q as Record<string, string>).toString()))
  if (state.type !== 'member' || !state.member.signup_completed_at || state.member.is_banned) {
    return (
      <Shell>
        <section className="card p-5" role="alert">
          <p className="text-sm text-n-666">{t(CONSENT_ERRORS.not_member)}</p>
        </section>
      </Shell>
    )
  }
  const m = state.member
  const { req } = check
  const app = req.client.name
  const existing = await myOAuthAgents(m.id, req.client.clientId).catch(() => [])
  const checked = new Set(requestedWrites(req.scope, m.is_admin))
  const offer = [...WRITE_SCOPES, ...(m.is_admin && checked.has('tools:review') ? ADMIN_SCOPES : [])]
  const err = typeof q.error_hint === 'string' && q.error_hint in CONSENT_ERRORS ? CONSENT_ERRORS[q.error_hint as keyof typeof CONSENT_ERRORS] : null

  return (
    <Shell>
      <form method="post" action="/api/oauth/authorize" className="card p-5 sm:p-6 space-y-5">
        <input type="hidden" name="client_id" value={req.client.clientId} />
        <input type="hidden" name="redirect_uri" value={req.redirectUri} />
        <input type="hidden" name="code_challenge" value={req.challenge} />
        {req.state != null && <input type="hidden" name="state" value={req.state} />}
        {req.resource && <input type="hidden" name="resource" value={req.resource} />}
        {req.scope && <input type="hidden" name="scope" value={req.scope} />}

        <header className="space-y-2">
          <h1 className="text-[19px] font-bold text-n-111 break-words">{t(CONSENT.title, { app })}</h1>
          <p className="text-sm text-n-555 leading-relaxed">{t(CONSENT.intro, { app, owner: m.display_name, agent: existing[0]?.name ?? app.slice(0, 40) })}</p>
          <p className="text-[12.5px] text-n-888 break-words">{t(CONSENT.unverified, { where: redirectLabel(req.redirectUri) })}</p>
        </header>

        <fieldset className="oauth-field space-y-2">
          <legend className="oauth-h">{t(existing.length > 0 ? CONSENT.agentLabel : CONSENT.nameLabel)}</legend>
          {existing.length > 0 && (
            <div className="space-y-1.5">
              {existing.map((a, i) => (
                <label key={a.id} className="oauth-choice">
                  <input type="radio" name="token_id" value={a.id} defaultChecked={i === 0} />
                  <AgentAvatar name={a.name} avatarUrl={a.avatarUrl} brand={a.brand} size={20} />
                  <span>{t(CONSENT.reconnect, { name: a.name })}</span>
                </label>
              ))}
              <label className="oauth-choice">
                <input type="radio" name="token_id" value="" />
                <span>{t(CONSENT.newAgent)}</span>
              </label>
            </div>
          )}
          <label className="block">
            {existing.length > 0 && <span className="oauth-sub">{t(CONSENT.nameLabel)}</span>}
            <input name="agent_name" aria-label={t(CONSENT.nameLabel)} className="input mt-1 w-full" defaultValue={app.slice(0, 40)} maxLength={40} required autoComplete="off" />
          </label>
        </fieldset>

        <section className="space-y-1.5">
          <h2 className="oauth-h">{t(CONSENT.canSee)}</h2>
          <ul className="oauth-list">
            {CONSENT_SEE.map((s) => (
              <li key={s}>{t(s)}</li>
            ))}
          </ul>
        </section>

        <fieldset className="space-y-1.5">
          <legend className="oauth-h">{t(CONSENT.canDo)}</legend>
          {offer.map((s) => (
            <label key={s} className="oauth-choice">
              <input type="checkbox" name="scope_write" value={s} defaultChecked={checked.has(s)} />
              <span className="min-w-0">
                {t(CONSENT_DO[s])}
                {/* A80: the tools this permission opens, straight from the registry */}
                <span className="oauth-tools">{toolsForScope(s, Boolean(m.is_admin)).join(' · ')}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <section className="space-y-1.5">
          <h2 className="oauth-h">{t(CONSENT.cannot)}</h2>
          <ul className="oauth-list oauth-list-no">
            {CONSENT_CANNOT.map((s) => (
              <li key={s}>{t(s)}</li>
            ))}
          </ul>
        </section>

        <div className="oauth-notes">
          <p>{t(CONSENT.profileNote)}</p>
          <p>{t(CONSENT.pledgeNote)}</p>
          <p>{t(CONSENT.revokeNote)}</p>
        </div>

        <div id="decision" className="space-y-3 scroll-mt-4">
          {err && <p className="oauth-error" role="alert">{t(err)}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="submit" name="decision" value="deny" className="btn btn-secondary min-h-[48px] rounded-full">{t(CONSENT.deny)}</button>
            <button type="submit" name="decision" value="allow" className="btn btn-primary min-h-[48px] rounded-full">{t(CONSENT.allow)}</button>
          </div>
        </div>
      </form>
    </Shell>
  )
}
