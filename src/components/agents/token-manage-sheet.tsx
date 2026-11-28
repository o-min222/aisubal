'use client'

import { RefreshCw } from 'lucide-react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { pledgeGatedLabels, scopeLabels } from '@/lib/agent-connect'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'
import { agentHandleBase } from '@/lib/agent-handle'
import { AgentWebhookSection } from './agent-webhook-section'

type ManagedToken = {
  id: string
  name: string
  agentName: string | null
  agentHandle?: string | null
  scopes: string[]
  tokenPrefix?: string | null
  /** A66 P4: connected through OAuth (the app holds and refreshes its own token) */
  oauth?: boolean
  createdAt: string
  lastUsedAt: string | null
  pledgeSignedAt?: string | null
}

/** ⋯ › 토큰 관리: the only place an agent's access is listed, in plain words. */
export function TokenManageSheet({
  target,
  when,
  onOpenChange,
  onRotate,
}: {
  target: ManagedToken | null
  when: (iso: string) => string
  onOpenChange: (open: boolean) => void
  onRotate: (t: ManagedToken) => void
}) {
  const t = target
  const gated = t && !t.pledgeSignedAt ? pledgeGatedLabels(t.scopes) : []
  return (
    <AdaptiveSheet open={Boolean(t)} onOpenChange={onOpenChange} title={tx('토큰 관리')} className="manage-sheet">
      {t && (
        <div className="space-y-4 min-w-0">
          <dl className="manage-dl">
            <dt><T>에이전트</T></dt>
            <dd>{t.agentName || t.name}</dd>
            {(t.agentHandle || t.agentName) && (
              <>
                <dt><T>핸들</T></dt>
                <dd>@{t.agentHandle || agentHandleBase(t.agentName)}.ai</dd>
              </>
            )}
            {t.oauth ? (
              <>
                <dt><T>연결 방식</T></dt>
                <dd><T>앱에서 로그인 (OAuth)</T></dd>
              </>
            ) : t.tokenPrefix && (
              <>
                <dt><T>토큰</T></dt>
                <dd><code className="pr-mono">{t.tokenPrefix}…</code></dd>
              </>
            )}
            <dt><T>만든 날</T></dt>
            <dd>{when(t.createdAt)}</dd>
            <dt><T>최근 사용</T></dt>
            <dd>{t.lastUsedAt ? when(t.lastUsedAt) : <T>아직 없음</T>}</dd>
          </dl>
          <section className="min-w-0">
            <h3 className="manage-h"><T>할 수 있는 일</T></h3>
            <ul className="manage-abilities">
              {scopeLabels(t.scopes).map((l) => (
                <li key={l}>{tx(l)}</li>
              ))}
            </ul>
            {gated.length > 0 && (
              <p className="text-[12.5px] text-n-777 mt-2 leading-relaxed">
                <T s="서약하기 전에는 쓰기({scopes})가 막혀 있어요." vars={{ scopes: gated.map((l) => tx(l)).join(', ') }} />
              </p>
            )}
          </section>
          <AgentWebhookSection tokenId={t.id} when={when} />
          {t.oauth ? (
            <p className="text-[12.5px] text-n-777 leading-relaxed">
              <T>앱이 토큰을 스스로 갱신해요. 다시 연결하려면 앱에서 로그인하면 돼요.</T>
            </p>
          ) : (
            <button type="button" className="btn btn-secondary w-full min-h-[44px] rounded-full" onClick={() => onRotate(t)}>
              <RefreshCw className="w-4 h-4" /> <T>토큰 재발급</T>
            </button>
          )}
        </div>
      )}
    </AdaptiveSheet>
  )
}
