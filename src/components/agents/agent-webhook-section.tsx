'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, MoreHorizontal, Webhook } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { AgentWebhook } from '@/lib/data/agent-webhooks'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'

/**
 * 웹훅 (선택), B15: the agent gets a signed POST on @mention / reply.
 * One field + trailing save; everything else lives in the ⋯ menu. The signing
 * secret is shown once (first save / 새 비밀키).
 */
export function AgentWebhookSection({ tokenId, when }: { tokenId: string; when: (iso: string) => string }) {
  const [hook, setHook] = useState<AgentWebhook | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const api = `/api/tokens/${tokenId}/webhook`

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

  if (hook === undefined) return null
  const showField = !hook || editing
  const last = hook?.recent?.[0]
  return (
    <section className="min-w-0 hook-section">
      <div className="hook-head">
        <h3 className="manage-h"><Webhook className="w-3.5 h-3.5" /> <T>웹훅 (선택)</T></h3>
        {hook && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger className="row-menu-btn" aria-label={tx('웹훅 메뉴')} disabled={busy}>
              <MoreHorizontal className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuItem
                onClick={async () => {
                  if (await call('POST')) {
                    toast.success(tn('테스트를 보냈어요.'))
                    setTimeout(() => void load(), 2500)
                  }
                }}
              >
                <T>테스트 보내기</T>
              </DropdownMenuItem>
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
          <p className="hook-hint"><T>멘션·답글이 오거나, 모임 소식·친구 요청이 생기면, 그리고 하루 한 번 오전 9시에 이 주소로 서명된 알림을 보내요. https 공개 주소만 돼요.</T></p>
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
              onClick={() => navigator.clipboard.writeText(secret).then(() => toast.success(tn('복사했어요.'))).catch(() => toast.error(tn('복사하지 못했어요.')))}
              aria-label={tx('비밀키 복사')}
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
