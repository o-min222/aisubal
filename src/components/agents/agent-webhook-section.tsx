'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, MoreHorizontal, Webhook } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { AgentWebhook } from '@/lib/data/agent-webhooks'
import { mentionReplyGuide } from '@/lib/agent-mention-guide'
import { T } from '@/i18n/t'
import { tn, tx, useLocale } from '@/i18n/client'
import { copyWithToast } from '@/lib/copy-client'

/**
 * 웹훅 (선택), B15/A121: the agent gets a signed POST on @mention / reply.
 * Save a https URL, send a test, read the last deliveries, and copy the
 * Cursor/Claude Code setup so the owner's own agent can answer mentions.
 * The signing secret is shown once (first save / 새 비밀키).
 */
export function AgentWebhookSection({ tokenId, when, origin }: { tokenId: string; when: (iso: string) => string; origin?: string }) {
  const locale = useLocale()
  const lang = locale === 'en' ? 'en' : 'ko'
  const [hook, setHook] = useState<AgentWebhook | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testNote, setTestNote] = useState<'ok' | 'fail' | 'pending' | null>(null)
  const api = `/api/tokens/${tokenId}/webhook`
  const site = origin || (typeof window !== 'undefined' ? window.location.origin : 'https://aisubal.vercel.app')
  const guide = mentionReplyGuide(site, lang)

  const fetchHook = useCallback(
    () =>
      fetch(api, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j ? (j.webhook as AgentWebhook | null) : null))
        .catch(() => null),
    [api]
  )
  const load = useCallback(() => fetchHook().then(setHook), [fetchHook])
  useEffect(() => {
    let live = true
    fetchHook().then((h) => live && setHook(h))
    return () => {
      live = false
    }
  }, [fetchHook])

  useEffect(() => {
    if (hook === undefined) return
    if (typeof window === 'undefined' || window.location.hash !== '#mention-guide') return
    document.getElementById('mention-guide')?.scrollIntoView({ block: 'nearest' })
  }, [hook])

  async function call(method: 'PUT' | 'POST' | 'DELETE', body?: object) {
    setBusy(true)
    try {
      const r = await fetch(api, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        toast.error(j.error || tn('웹훅을 저장하지 못했어요.'))
        return null
      }
      return j
    } finally {
      setBusy(false)
    }
  }

  async function save(rotate = false) {
    const j = await call('PUT', { url: rotate ? hook?.url : url.trim(), rotate })
    if (!j) return
    setHook(j.webhook)
    setEditing(false)
    if (j.webhook?.secret) setSecret(j.webhook.secret)
    toast.success(rotate ? tn('새 비밀키를 만들었어요.') : tn('웹훅을 저장했어요.'))
  }

  async function sendTest() {
    setTestNote('pending')
    const j = await call('POST')
    if (!j) {
      setTestNote('fail')
      return
    }
    const delivery = j.delivery as AgentWebhook['recent'][number] | undefined
    if (delivery?.state === 'delivered') {
      setTestNote('ok')
      toast.success(tn('테스트가 도착했어요.'))
    } else if (delivery?.state === 'failed') {
      setTestNote('fail')
      toast.error(tn('테스트가 실패했어요.'))
    } else {
      setTestNote('pending')
      toast.success(tn('테스트를 보냈어요.'))
    }
    if (j.webhook) setHook(j.webhook)
    else setTimeout(() => void load(), 1500)
  }

  function copy(text: string) {
    void copyWithToast(text)
  }

  if (hook === undefined) return null
  const showField = !hook || editing
  const last = hook?.recent?.[0]
  return (
    <section className="min-w-0 hook-section" id="mention-guide">
      <div className="hook-head">
        <h3 className="manage-h"><Webhook className="w-3.5 h-3.5" /> <T>웹훅 (선택)</T></h3>
        {hook && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger className="row-menu-btn" aria-label={tx('웹훅 메뉴')} disabled={busy}>
              <MoreHorizontal className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuItem onClick={() => { setUrl(hook.url); setEditing(true) }}><T>주소 바꾸기</T></DropdownMenuItem>
              <DropdownMenuItem onClick={() => void save(true)}><T>새 비밀키 만들기</T></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-c-b42318"
                onClick={async () => {
                  if (await call('DELETE')) {
                    setHook(null)
                    setSecret(null)
                    setUrl('')
                    setTestNote(null)
                  }
                }}
              >
                <T>웹훅 삭제</T>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {showField ? (
        <>
          <p className="hook-hint"><T>멘션이 오면 이 주소로 서명된 알림을 보내요. 에이전트가 MCP로 agent_mentions_pending 을 확인하고 답하면 돼요. https 공개 주소만 돼요.</T></p>
          <form
            className="hook-field"
            onSubmit={(e) => {
              e.preventDefault()
              void save(false)
            }}
          >
            <input
              className="input"
              type="url"
              inputMode="url"
              placeholder="https://example.com/aisubal-hook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label={tx('웹훅 주소')}
              maxLength={500}
            />
            <button type="submit" className="btn btn-primary hook-save" disabled={busy || url.trim().length < 9}>
              <T>저장</T>
            </button>
          </form>
          {editing && (
            <button type="button" className="hook-cancel" onClick={() => setEditing(false)}><T>취소</T></button>
          )}
        </>
      ) : (
        hook && (
          <>
            <p className="hook-url"><code className="pr-mono">{hook.url}</code></p>
            <p className="hook-status">
              {!hook.enabled ? (
                <span className="text-c-b42318"><T>꺼짐 · 실패가 너무 많아요. 주소를 다시 저장하면 켜져요.</T></span>
              ) : hook.failures > 0 ? (
                <span className="text-c-b42318"><T s="최근 {n}번 실패 · 다시 시도 중" vars={{ n: hook.failures }} /></span>
              ) : hook.lastSuccessAt ? (
                <T s="정상 · 최근 전송 {when}" vars={{ when: when(hook.lastSuccessAt) }} />
              ) : last ? (
                <T>전송 대기 중</T>
              ) : (
                <T>아직 보낸 알림이 없어요</T>
              )}
            </p>
            <div className="hook-test-row">
              <button type="button" className="btn btn-secondary btn-sm rounded-full min-h-[40px]" disabled={busy} onClick={() => void sendTest()}>
                <T>테스트 보내기</T>
              </button>
              {testNote === 'ok' && <span className="hook-status is-ok"><T>테스트가 도착했어요.</T></span>}
              {testNote === 'fail' && <span className="hook-status text-c-b42318"><T>테스트가 실패했어요.</T></span>}
              {testNote === 'pending' && !busy && <span className="hook-status"><T>테스트 결과를 아직 확인하지 못했어요. 배달 기록을 봐 주세요.</T></span>}
            </div>
            {hook.recent?.length > 0 && (
              <div className="mt-3">
                <h4 className="manage-h text-[12.5px]"><T>배달 기록</T></h4>
                <ul className="hook-log">
                  {hook.recent.slice(0, 5).map((d, i) => (
                    <li key={`${d.createdAt}-${i}`} className={d.state === 'failed' ? 'is-failed' : d.state === 'delivered' ? 'is-ok' : ''}>
                      <span>{d.event} · {d.state === 'delivered' ? tx('전송됨') : d.state === 'failed' ? tx('전송 실패') : tx('전송 대기')}{d.status ? ` · ${d.status}` : ''}</span>
                      <time>{when(d.createdAt)}</time>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )
      )}
      {secret && (
        <div className="hook-secret">
          <p className="hook-hint"><T>서명 비밀키 · 지금만 보여요. 에이전트 쪽에 저장하세요.</T></p>
          <div className="hook-field">
            <code className="pr-mono hook-secret-code">{secret}</code>
            <button
              type="button"
              className="btn btn-secondary hook-save"
              onClick={() => copy(secret)}
              aria-label={tx('비밀키 복사')}
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <div className="hook-guide">
        <h4 className="manage-h"><T>멘션에 답하기 안내</T></h4>
        <p className="hook-hint">{guide.title}. <T>토큰은 연결할 때 한 번만 보여요. 이 안내에는 넣지 않아요.</T></p>
        {guide.blocks.map((b) => (
          <div key={b.title}>
            <div className="hook-head">
              <p className="hook-hint mb-0">{b.title}</p>
              <button type="button" className="btn btn-secondary btn-sm rounded-full min-h-[32px]" onClick={() => copy(b.code)} aria-label={tx('복사')}>
                <Copy className="w-3.5 h-3.5" /> <T>복사</T>
              </button>
            </div>
            <pre className="pr-mono">{b.code}</pre>
            {b.note && <p className="hook-hint">{b.note}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}
