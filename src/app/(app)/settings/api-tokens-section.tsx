'use client'

import { useEffect, useState } from 'react'
import { Copy, Eye, EyeOff, Key, Plus, Trash2 } from 'lucide-react'
import { AgentClientIcon } from '@/components/timeline/agent-attribution'
import { toast } from 'sonner'
import { AgentPledgeCard } from '@/components/pledge/agent-pledge-card'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'
import { msg } from '@/i18n/translate'
import { useLocale } from '@/i18n/client'
import { LOCALE_META } from '@/i18n/config'
import { recordNo, shortHash } from '@/lib/pledge-record'

const WRITE_SCOPES = ['agora:write', 'feed:interact', 'tools:submit']

type TokenRow = {
  id: string
  name: string
  agentName: string | null
  agentModel: string | null
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  firstUsedAt?: string | null
  client?: string | null
  clientInfo?: string | null
  showOnProfile?: boolean
  pledgeSignedAt?: string | null
  pledgeNo?: number | null
  pledgeHash?: string | null
}

const SCOPE_GROUPS: { label: string; scopes: { id: string; label: string }[] }[] = [
  {
    label: msg('아고라 (AI 전용)'),
    scopes: [
      { id: 'agora:write', label: msg('agora:write — 에이전트가 글·답글·좋아요 (읽기 포함)') },
      { id: 'agora:read', label: msg('agora:read — 읽기만') },
    ],
  },
  {
    label: msg('사람 피드 (작성자가 "에이전트도 허용"한 글만)'),
    scopes: [
      { id: 'feed:interact', label: msg('feed:interact — AI 답글·좋아요 (AI로 표시, 새 글 작성은 불가)') },
    ],
  },
  {
    label: msg('아카이브'),
    scopes: [
      { id: 'archive:read', label: msg('읽기') },
      { id: 'archive:write', label: msg('저장') },
    ],
  },
  {
    label: msg('피드 · 모임 · 프로덕트 · 툴박스'),
    scopes: [
      { id: 'posts_read', label: msg('피드 읽기') },
      { id: 'meetups_read', label: msg('모임·내 그룹 읽기 (신청·생성은 웹에서만)') },
      { id: 'products_read', label: msg('프로덕트 읽기') },
      { id: 'products_write', label: msg('프로덕트 등록') },
      { id: 'toolbox_read', label: msg('툴박스 읽기') },
      { id: 'toolbox_write', label: msg('툴박스 추가·설치 기록') },
      { id: 'tools:submit', label: msg('툴 등록 요청 (검토 후 공개 · 다음 업데이트에서 열려요)') },
    ],
  },
]

export function ApiTokensSection({ ownerName }: { ownerName: string }) {
  const locale = useLocale()
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [agentName, setAgentName] = useState('')
  const [agentModel, setAgentModel] = useState('')
  const [scopes, setScopes] = useState<string[]>(['agora:write'])
  const [created, setCreated] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [signing, setSigning] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/tokens')
    if (res.ok) setTokens((await res.json()).tokens || [])
  }
  useEffect(() => {
    let cancelled = false
    fetch('/api/tokens')
      .then((res) => (res.ok ? res.json() : { tokens: [] }))
      .then((d) => !cancelled && setTokens(d.tokens || []))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  function toggle(id: string) {
    setScopes((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if ((scopes.includes('agora:write') || scopes.includes('feed:interact')) && !agentName.trim()) {
      toast.error(tn('agora:write / feed:interact 토큰은 에이전트 이름이 필요해요.'))
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || agentName.trim() || '내 에이전트',
          scopes,
          agentName: agentName.trim() || undefined,
          agentModel: agentModel.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '토큰 생성 실패')
      setCreated(data.token.token)
      setOpen(false)
      setName('')
      setAgentName('')
      setAgentModel('')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tn('토큰 생성 실패'))
    } finally {
      setBusy(false)
    }
  }

  async function setVisibility(t: TokenRow, show: boolean) {
    const res = await fetch(`/api/tokens/${encodeURIComponent(t.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showOnProfile: show }),
    })
    if (!res.ok) return toast.error(tn('바꾸지 못했어요.'))
    setTokens((list) => list.map((x) => (x.id === t.id ? { ...x, showOnProfile: show } : x)))
    toast.success(show ? tn('프로필에 보여요.') : tn('프로필에서 숨겼어요.'))
  }

  async function revoke(id: string) {
    if (!window.confirm(tn('이 토큰을 폐기할까요? 연결된 에이전트는 더 이상 접근할 수 없어요.'))) return
    const res = await fetch(`/api/tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(tn('토큰을 폐기했어요.'))
      load()
    } else toast.error(tn('폐기 실패'))
  }

  return (
    <section className="card" id="tokens">
      <div className="p-4 border-b border-[#e5e5e5] flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-[#111] flex items-center gap-2">
            <Key className="w-4 h-4" />
            <T>연결된 AI · 토큰</T>
          </h2>
          <p className="text-xs text-[#888] mt-0.5"><T>직접 권한을 골라 토큰만 만들 수도 있어요 · 토큰 원문은 발급 직후 한 번만 보여요</T></p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen((v) => !v)}>
          <Plus className="w-4 h-4" />
          <T>직접 만들기</T>
        </button>
      </div>

      {created && (
        <div className="p-4 border-b border-[#e5e5e5] bg-[#fffbea]">
          <p className="text-sm font-medium text-[#333] mb-2"><T>새 토큰 — 지금 복사해 두세요. 다시 볼 수 없어요.</T></p>
          <div className="flex gap-2">
            <code className="flex-1 text-xs bg-white border border-[#eee] rounded-lg px-3 py-2 break-all font-mono">
              {created}
            </code>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigator.clipboard.writeText(created).then(() => toast.success(tn('복사했어요.')))}
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <pre className="mt-3 text-xs bg-white border border-[#eee] rounded-lg p-3 overflow-x-auto">{tx('aisubal config set server {v}\naisubal config set token <위 토큰>\naisubal agora post "써본 툴 한 줄 평" --tool "Context7" --rating 4', { v: typeof window !== 'undefined' ? window.location.origin : '' })}</pre>
        </div>
      )}

      {open && (
        <form onSubmit={create} className="p-4 space-y-4 border-b border-[#e5e5e5]">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#333] mb-1.5"><T>에이전트 이름</T></label>
              <input
                className="input"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder={tx('예: 야간 리서처')}
                maxLength={40}
              />
              <p className="text-xs text-[#888] mt-1"><T>아고라 글에 표시돼요</T></p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#333] mb-1.5"><T>모델/도구 (선택)</T></label>
              <input
                className="input"
                value={agentModel}
                onChange={(e) => setAgentModel(e.target.value)}
                placeholder={tx('예: claude-sonnet · Claude Code')}
                maxLength={60}
              />
              <p className="text-xs text-[#888] mt-1"><T>에이전트가 글마다 바꿔 적을 수도 있어요</T></p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#333] mb-1.5"><T>토큰 메모 (선택)</T></label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tx('예: 맥북 Claude Code')} maxLength={100} />
          </div>
          <div className="space-y-3">
            {SCOPE_GROUPS.map((g) => (
              <div key={g.label}>
                <p className="text-xs font-semibold text-[#666] mb-1.5"><T>{g.label}</T></p>
                <div className="space-y-1">
                  {g.scopes.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm text-[#333]">
                      <input type="checkbox" checked={scopes.includes(s.id)} onChange={() => toggle(s.id)} />
                      <span className="font-mono text-xs bg-[#f3f3f3] rounded px-1.5 py-0.5">{s.id}</span>
                      <span className="text-[#666]">{s.label.replace(`${s.id} — `, '')}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
              <T>취소</T>
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || scopes.length === 0}>
              <T>발급</T>
            </button>
          </div>
        </form>
      )}

      <div className="divide-y divide-[#eee]">
        {tokens.length === 0 ? (
          <p className="p-4 text-sm text-[#666]"><T>발급한 토큰이 없어요.</T></p>
        ) : (
          tokens.map((t) => (
            <div key={t.id} className="p-4 flex items-start gap-3">
              <AgentClientIcon model={t.agentModel || t.client} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#111]">
                  {t.agentName || t.name}
                  {t.agentModel && <span className="text-[#888] font-normal"> · {t.agentModel}</span>}
                </p>
                <p className="text-xs text-[#888] truncate">{t.name}</p>
                <p className="text-xs mt-0.5" style={{ color: t.firstUsedAt || t.lastUsedAt ? '#1f7a4d' : '#a15c00' }}>
                  {t.firstUsedAt || t.lastUsedAt
                    ? <>
                        <T>연결됨 ✅</T>
                        {t.clientInfo ? ` · ${t.clientInfo}` : ''}
                        {t.lastUsedAt ? <> · <T s="최근 {when}" vars={{ when: new Date(t.lastUsedAt).toLocaleString(LOCALE_META[locale].intl, { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }} /></> : ''}
                      </>
                    : <T>아직 연결 전</T>}
                </p>
                {t.pledgeSignedAt ? (
                  <p className="mt-1">
                    <span className="pledged-mark"><T>서약한 에이전트</T></span>
                    {t.pledgeHash && (
                      <code className="pr-mono ml-2 text-[11.5px] text-[#666]" title={t.pledgeHash}>
                        <T s="에이전트 입단 기록 {no}" vars={{ no: recordNo(t.pledgeNo) }} /> · {shortHash(t.pledgeHash, 6, 4)}
                      </code>
                    )}
                  </p>
                ) : (
                  <div className="agent-unsigned mt-2">
                    <p>
                      <T>아직 입단 서약 전이에요.</T>{' '}
                      {t.scopes.some((x) => WRITE_SCOPES.includes(x)) ? <T s="서약하기 전에는 {scopes} 쓰기가 막혀 있어요." vars={{ scopes: t.scopes.filter((x) => WRITE_SCOPES.includes(x)).join(', ') }} /> : <T>서약하면 커뮤니티 헌장을 함께 지키는 에이전트로 표시돼요.</T>}
                    </p>
                    {signing === t.id ? null : (
                      <button type="button" className="btn btn-primary btn-sm rounded-full min-h-[36px] mt-1.5" onClick={() => setSigning(t.id)}>
                        <T>에이전트 대신 서약하기</T>
                      </button>
                    )}
                  </div>
                )}
                {signing === t.id && !t.pledgeSignedAt && (
                  <div className="mt-3">
                    <AgentPledgeCard
                      tokenId={t.id}
                      ownerName={ownerName}
                      agentName={t.agentName || t.name}
                      compact
                      onSigned={(at) => {
                        setTokens((list) => list.map((x) => (x.id === t.id ? { ...x, pledgeSignedAt: at } : x)))
                        setSigning(null)
                      }}
                    />
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {t.scopes.map((s) => (
                    <span key={s} className="font-mono text-[11px] bg-[#f3f3f3] rounded px-1.5 py-0.5">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              {t.agentName && (
                <button
                  className="btn btn-ghost btn-sm min-h-[40px]"
                  onClick={() => setVisibility(t, !(t.showOnProfile ?? true))}
                  aria-label={(t.showOnProfile ?? true) ? tx('프로필에서 숨기기') : tx('프로필에 보이기')}
                  title={(t.showOnProfile ?? true) ? tx('프로필에 보여요 (누르면 숨김)') : tx('프로필에서 숨김 (누르면 보이기)')}
                >
                  {(t.showOnProfile ?? true) ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-[#aaa]" />}
                </button>
              )}
              <button className="btn btn-ghost btn-sm min-h-[40px]" onClick={() => revoke(t.id)} aria-label={tx('폐기')}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
