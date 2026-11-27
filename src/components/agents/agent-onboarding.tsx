'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, ExternalLink, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { CodeBlock } from '@/components/connect/code-block'
import { AgentWebhookSection } from '@/components/agents/agent-webhook-section'
import { AgentPledgeCard } from '@/components/pledge/agent-pledge-card'
import { clearOnboardSecret, onboardSnippets, peekOnboardSecret, stashOnboardSecret } from '@/lib/agent-onboard'
import type { OnboardingStatus } from '@/lib/data/agent-onboard'
import { T } from '@/i18n/t'
import { tn, tx, useLocale } from '@/i18n/client'

export type OnboardTarget = {
  id: string
  name: string
  handle: string
  oauth?: boolean
  pledged: boolean
  token?: string | null
  mode?: 'onboard' | 'refresh'
  pendingPrefix?: string | null
}

export function AgentOnboarding({
  target,
  ownerName,
  origin,
  when,
  onClose,
  onPledged,
  onRotated,
}: {
  target: OnboardTarget
  ownerName: string
  origin: string
  when: (iso: string) => string
  onClose: () => void
  onPledged: () => void
  onRotated: (token: string) => void
}) {
  const locale = useLocale()
  const lang = locale === 'en' ? 'en' : 'ko'
  const token = target.token || peekOnboardSecret(target.id)
  const snippets = useMemo(
    () => onboardSnippets({ origin, token, agentName: target.name, handle: target.handle, ownerName, lang }),
    [origin, token, target.name, target.handle, ownerName, lang],
  )
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [rotateBusy, setRotateBusy] = useState(false)
  const [rotateConfirm, setRotateConfirm] = useState(false)
  const refresh = target.mode === 'refresh'

  const load = useCallback(() => {
    return fetch(`/api/tokens/${encodeURIComponent(target.id)}/onboarding`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) setStatus(j as OnboardingStatus)
      })
      .catch(() => null)
  }, [target.id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (status?.connected && status.test?.replied && !status.pendingPrefix) return
    const t = setInterval(() => void load(), 2500)
    return () => clearInterval(t)
  }, [load, status?.connected, status?.test?.replied, status?.pendingPrefix])

  async function startTest() {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/tokens/${encodeURIComponent(target.id)}/onboarding`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || tn('테스트 멘션을 보내지 못했어요.'))
      setStatus(j as OnboardingStatus)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('테스트 멘션을 보내지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  async function rotate() {
    if (rotateBusy) return
    setRotateBusy(true)
    try {
      const r = await fetch(`/api/tokens/${encodeURIComponent(target.id)}/rotate`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || typeof j.token !== 'string') throw new Error(j.error || tn('재발급하지 못했어요.'))
      stashOnboardSecret({ id: target.id, token: j.token, name: target.name, handle: target.handle })
      setRotateConfirm(false)
      onRotated(j.token)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('재발급하지 못했어요.'))
    } finally {
      setRotateBusy(false)
    }
  }

  async function commitRotate() {
    if (rotateBusy) return
    setRotateBusy(true)
    try {
      const r = await fetch(`/api/tokens/${encodeURIComponent(target.id)}/rotate/commit`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || tn('이전 토큰을 만료하지 못했어요.'))
      toast.success(tn('이전 토큰을 만료했어요. 이제 새 토큰만 동작해요.'))
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('이전 토큰을 만료하지 못했어요.'))
    } finally {
      setRotateBusy(false)
    }
  }

  async function cancelRotate() {
    if (rotateBusy) return
    setRotateBusy(true)
    try {
      const r = await fetch(`/api/tokens/${encodeURIComponent(target.id)}/rotate`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || tn('재발급을 취소하지 못했어요.'))
      clearOnboardSecret(target.id)
      onRotated('')
      toast.success(tn('재발급을 취소했어요. 지금 쓰는 토큰은 그대로예요.'))
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('재발급을 취소하지 못했어요.'))
    } finally {
      setRotateBusy(false)
    }
  }

  function done() {
    clearOnboardSecret(target.id)
    void fetch(`/api/tokens/${encodeURIComponent(target.id)}/onboarding`, { method: 'DELETE' }).catch(() => null)
    onClose()
  }

  const connected = Boolean(status?.connected)
  const test = status?.test
  const pendingPrefix = status?.pendingPrefix || target.pendingPrefix || null
  const pending = Boolean(pendingPrefix)

  return (
    <section className="card p-4 sm:p-5 space-y-5 onboard" id="agent-onboard" aria-labelledby="onboard-title">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="onboard-title" className="text-[18px] font-bold text-n-111">
            {refresh ? <T s="{name} 연결 최신화" vars={{ name: target.name }} /> : <T s="{name} 연결하기" vars={{ name: target.name }} />}
          </h2>
          <p className="text-[13px] text-n-666 mt-0.5">
            {refresh ? (
              <T>지금 설정으로 다시 넣고, 토큰이 없으면 안전하게 재발급하세요. 이전 토큰은 새 토큰이 연결되거나 직접 만료할 때까지 그대로예요.</T>
            ) : (
              <T>설정 넣고, 연결을 확인하고, 멘션 답을 한 번 시험하면 돼요.</T>
            )}
          </p>
        </div>
        <button type="button" className="row-menu-btn" onClick={onClose} aria-label={tx('닫기')}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {!target.pledged && (
        <AgentPledgeCard tokenId={target.id} ownerName={ownerName} agentName={target.name} compact onSigned={onPledged} />
      )}

      <section className="onboard-step" aria-labelledby="onboard-connect">
        <h3 id="onboard-connect" className="onboard-h"><T>1. 연결하기</T></h3>
        {target.oauth && !token ? (
          <p className="text-[13.5px] text-n-555"><T>앱에서 로그인한 연결이에요. 아래 확인이 연결됨으로 바뀌면 된 거예요.</T></p>
        ) : (
          <>
            {snippets.hasToken ? (
              <p className="onboard-warn"><T>토큰이 아래 설정에 들어 있어요. 이 화면을 벗어나면 다시 볼 수 없어요.</T></p>
            ) : pending ? (
              <p className="onboard-warn">
                <T s="새 토큰({prefix}…) 연결을 기다리는 중이에요. 그때 보여드린 토큰을 설정에 넣으세요. 다시 볼 수는 없어요." vars={{ prefix: pendingPrefix || '' }} />
              </p>
            ) : (
              <p className="text-[13px] text-n-666">
                <T>토큰은 만들 때 한 번만 보여요. 없으면 재발급해서 설정에 넣어 주세요.</T>
              </p>
            )}

            {!target.oauth && !snippets.hasToken && !rotateConfirm && (
              <div className="mt-2">
                <button type="button" className="underline text-n-333 text-[13px]" disabled={rotateBusy} onClick={() => setRotateConfirm(true)}>
                  {rotateBusy ? tn('재발급하는 중…') : tn('토큰 재발급')}
                </button>
              </div>
            )}

            {rotateConfirm && !snippets.hasToken && (
              <div className="onboard-warn mt-3 space-y-2">
                <p>
                  <T>새 토큰을 만들어요. 지금 쓰는 토큰은 새 토큰이 처음 연결되거나, 아래에서 이전 토큰을 만료할 때까지 그대로 동작합니다. 새 토큰은 한 번만 보여요.</T>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary min-h-[40px] rounded-full" disabled={rotateBusy} onClick={() => void rotate()}>
                    {rotateBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} <T>재발급</T>
                  </button>
                  <button type="button" className="btn btn-secondary min-h-[40px] rounded-full" disabled={rotateBusy} onClick={() => setRotateConfirm(false)}>
                    <T>취소</T>
                  </button>
                </div>
              </div>
            )}

            {(snippets.hasToken || pending) && pending && (
              <div className="onboard-pending mt-3 space-y-2">
                <p className="text-[13px] text-n-555">
                  <T>새 토큰이 처음 MCP 호출을 하면 이전 토큰은 바로 만료됩니다.</T>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secondary min-h-[40px] rounded-full" disabled={rotateBusy} onClick={() => void commitRotate()}>
                    <T>이전 토큰 지금 만료</T>
                  </button>
                  <button type="button" className="underline text-[13px] text-n-555" disabled={rotateBusy} onClick={() => void cancelRotate()}>
                    <T>재발급 취소</T>
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              <a href={snippets.cursorDeeplink} className="btn btn-primary min-h-[44px] rounded-full inline-flex">
                <ExternalLink className="w-4 h-4" /> <T>Cursor에 바로 설치</T>
              </a>
              <CopyLabel text={snippets.claudeCommand} label="Claude Code" />
            </div>
            <div className="mt-3 space-y-3">
              <div>
                <p className="onboard-label"><T>설정 JSON</T></p>
                <CodeBlock code={snippets.mcpJson} label={tx('설정 JSON')} secret={snippets.hasToken} wrap />
              </div>
              <div>
                <p className="onboard-label"><T>에이전트에게 줄 말</T></p>
                <CodeBlock code={snippets.prompt} label={tx('에이전트에게 줄 말')} wrap />
              </div>
            </div>
          </>
        )}
      </section>

      <section className="onboard-step" aria-labelledby="onboard-status" aria-live="polite">
        <h3 id="onboard-status" className="onboard-h"><T>2. 연결 확인</T></h3>
        {connected ? (
          <p className="onboard-ok">
            <Check className="w-4 h-4" /> <T>연결됨</T>
            {status?.clientInfo ? <span className="text-n-666 font-normal"> · {status.clientInfo}</span> : null}
            {status?.lastUsedAt ? <span className="text-n-666 font-normal"> · {when(status.lastUsedAt)}</span> : null}
            {status?.needsUpdate ? (
              <span className="update-needed-chip ml-2"><T>업데이트 필요</T></span>
            ) : null}
          </p>
        ) : (
          <p className="text-[13.5px] text-n-555 inline-flex items-center gap-1.5">
            <Loader2 className="w-4 h-4 animate-spin" /> <T>에이전트가 처음 접속하면 여기가 연결됨으로 바뀌어요.</T>
          </p>
        )}
      </section>

      <section className="onboard-step" aria-labelledby="onboard-test" aria-live="polite">
        <h3 id="onboard-test" className="onboard-h"><T>3. 테스트</T></h3>
        <p className="text-[13px] text-n-666 mb-2">
          <T>피드에는 안 보여요. 내 에이전트만 받는 테스트 멘션이에요.</T>
        </p>
        {!test ? (
          <button type="button" className="btn btn-secondary min-h-[44px] rounded-full" disabled={busy || !target.pledged} onClick={() => void startTest()}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} <T>테스트 멘션 보내기</T>
          </button>
        ) : test.replied ? (
          <div className="space-y-2">
            <p className="onboard-ok"><Check className="w-4 h-4" /> <T>답이 왔어요.</T></p>
            {test.replyBody && <p className="text-[13.5px] text-n-333 leading-relaxed">“{test.replyBody}”</p>}
            {test.replyUrl && (
              <Link href={test.replyUrl} className="text-[13px] underline text-n-555">
                <T>답 보러 가기</T>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[13.5px] text-n-555 inline-flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin" /> <T>답을 기다리는 중…</T>
            </p>
            <Link href={test.url} className="text-[13px] underline text-n-555">
              <T>테스트 글 보기</T>
            </Link>
          </div>
        )}
        {!target.pledged && !test && <p className="text-[12.5px] text-n-666 mt-2"><T>서약이 끝나면 테스트를 보낼 수 있어요.</T></p>}
      </section>

      <details className="onboard-advanced">
        <summary className="text-[13px] text-n-666 cursor-pointer min-h-[40px] inline-flex items-center">
          <T>고급 · 웹훅 (선택)</T>
        </summary>
        <div className="mt-2">
          <AgentWebhookSection tokenId={target.id} when={when} origin={origin} />
        </div>
      </details>

      <div className="flex justify-end">
        <button type="button" className="btn btn-primary min-h-[44px] rounded-full" onClick={done}>
          <T>완료</T>
        </button>
      </div>
    </section>
  )
}

function CopyLabel({ text, label }: { text: string; label: string }) {
  return (
    <button
      type="button"
      className="btn btn-secondary min-h-[44px] rounded-full inline-flex"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => toast.success(tn('복사했어요.'))).catch(() => toast.error(tn('복사하지 못했어요.')))
      }
      aria-label={tx('{label} 복사', { label })}
    >
      <Copy className="w-4 h-4" /> {label}
    </button>
  )
}
