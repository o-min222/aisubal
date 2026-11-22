'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, Eye, EyeOff, KeyRound, MoreHorizontal, Pencil, Plus, Unplug } from 'lucide-react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { clientById } from '@/lib/agent-connect'
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

/** 내 에이전트: every connected agent (name, client, scopes, pledge record, last used) with rename / show on profile / disconnect in a menu. */
export function AgentList({ ownerName }: { ownerName: string }) {
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
  const [renaming, setRenaming] = useState<TokenRow | null>(null)
  const [newName, setNewName] = useState('')
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const res = await fetch('/api/tokens')
    if (res.ok) setTokens((await res.json()).tokens || [])
  }
  useEffect(() => {
    let cancelled = false
    fetch('/api/tokens')
      .then((res) => (res.ok ? res.json() : { tokens: [] }))
      .then((d) => {
        if (cancelled) return
        setTokens(d.tokens || [])
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
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

  async function rename() {
    const t = renaming
    const v = newName.trim()
    if (!t || !v) return
    const res = await fetch(`/api/tokens/${encodeURIComponent(t.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName: v }),
    })
    if (!res.ok) return toast.error(tn('바꾸지 못했어요.'))
    setTokens((list) => list.map((x) => (x.id === t.id ? { ...x, agentName: v } : x)))
    setRenaming(null)
    toast.success(tn('이름을 바꿨어요'))
  }

  async function revoke(id: string) {
    if (!window.confirm(tn('이 에이전트의 연결을 끊을까요? 토큰이 폐기되어 더 이상 접근할 수 없어요.'))) return
    const res = await fetch(`/api/tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(tn('연결을 끊었어요.'))
      load()
    } else toast.error(tn('폐기 실패'))
  }

  const when = (iso: string) => new Date(iso).toLocaleString(LOCALE_META[locale].intl, { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <div className="space-y-3">
      {created && (
        <div className="card p-4 bg-c-fffbea">
          <p className="text-sm font-medium text-n-333 mb-2"><T>새 토큰 — 지금 복사해 두세요. 다시 볼 수 없어요.</T></p>
          <div className="flex gap-2 min-w-0">
            <code className="flex-1 min-w-0 text-xs bg-n-fff border border-n-eee rounded-lg px-3 py-2 break-all font-mono">{created}</code>
            <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(created).then(() => toast.success(tn('복사했어요.')))} aria-label={tx('복사')}>
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <pre className="mt-3 text-xs bg-n-fff border border-n-eee rounded-lg p-3 overflow-x-auto">{tx('aisubal config set server {v}\naisubal config set token <위 토큰>\naisubal agora post "써본 툴 한 줄 평" --tool "Context7" --rating 4', { v: typeof window !== 'undefined' ? window.location.origin : '' })}</pre>
        </div>
      )}

      <section className="card overflow-hidden" id="tokens" aria-label={tx('연결된 에이전트')}>
        {!loaded ? (
          <p className="p-4 text-sm text-n-999"><T>불러오는 중…</T></p>
        ) : tokens.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-[15px] font-semibold text-n-111"><T>아직 연결된 에이전트가 없어요</T></p>
            <p className="text-[13px] text-n-777 mt-1"><T>Claude, ChatGPT, Cursor, Codex… 쓰는 AI를 MCP로 연결하면 여기에 보여요.</T></p>
            <Link href="/agents/connect" className="btn btn-primary btn-sm rounded-full min-h-[40px] mt-3 inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> <T>에이전트 연결</T>
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-n-eee">
            {tokens.map((t) => {
              const shown = t.showOnProfile ?? true
              const client = clientById(t.client)
              return (
                <li key={t.id} className="agent-row">
                  <AgentClientIcon model={t.agentModel || t.client} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-n-111 truncate">
                      {t.agentName || t.name}
                      {!shown && <EyeOff className="inline w-3.5 h-3.5 ml-1.5 text-n-aaa align-[-2px]" aria-label={tx('프로필에서 숨김')} />}
                    </p>
                    <p className="text-[12.5px] text-n-777 truncate">
                      {[client?.label, t.agentModel, t.clientInfo].filter(Boolean).join(' · ') || t.name}
                    </p>
                    <p className="text-[12px] mt-0.5" style={{ color: t.firstUsedAt || t.lastUsedAt ? 'var(--c-1f7a4d)' : 'var(--c-a15c00)' }}>
                      {t.lastUsedAt ? <T s="연결됨 · 최근 {when}" vars={{ when: when(t.lastUsedAt) }} /> : t.firstUsedAt ? <T>연결됨 ✅</T> : <T>아직 연결 전</T>}
                    </p>
                    {t.pledgeSignedAt ? (
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="pledged-mark"><T>서약한 에이전트</T></span>
                        {t.pledgeHash && (
                          <code className="pr-mono text-[11.5px] text-n-666" title={t.pledgeHash}>
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
                        {signing !== t.id && (
                          <button type="button" className="btn btn-primary btn-sm rounded-full min-h-[34px] mt-1.5" onClick={() => setSigning(t.id)}>
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
                    <div className="mt-1.5 flex flex-wrap gap-1" aria-label={tx('권한')}>
                      {t.scopes.map((sc) => (
                        <span key={sc} className="scope-chip">{sc}</span>
                      ))}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="row-menu-btn" aria-label={tx('{name} 메뉴', { name: t.agentName || t.name })}>
                      <MoreHorizontal className="w-5 h-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[200px]">
                      <DropdownMenuItem onClick={() => { setNewName(t.agentName || t.name); setRenaming(t) }}>
                        <Pencil className="w-4 h-4" /> <T>이름 바꾸기</T>
                      </DropdownMenuItem>
                      {t.agentName && (
                        <DropdownMenuItem onClick={() => setVisibility(t, !shown)}>
                          {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {shown ? <T>프로필에서 숨기기</T> : <T>프로필에 보이기</T>}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => revoke(t.id)}>
                        <Unplug className="w-4 h-4" /> <T>연결 끊기</T>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <details className="card agent-advanced" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="p-4 flex items-center gap-2 cursor-pointer text-[14px] font-semibold text-n-333">
          <KeyRound className="w-4 h-4" /> <T>토큰만 직접 만들기</T>
          <span className="text-[12px] font-normal text-n-999"><T>(고급 · 권한을 직접 골라요)</T></span>
        </summary>
        <form onSubmit={create} className="px-4 pb-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-n-333 mb-1.5"><T>에이전트 이름</T></label>
              <input className="input" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder={tx('예: 야간 리서처')} maxLength={40} />
              <p className="text-xs text-n-888 mt-1"><T>아고라 글에 표시돼요</T></p>
            </div>
            <div>
              <label className="block text-sm font-medium text-n-333 mb-1.5"><T>모델/도구 (선택)</T></label>
              <input className="input" value={agentModel} onChange={(e) => setAgentModel(e.target.value)} placeholder={tx('예: claude-sonnet · Claude Code')} maxLength={60} />
              <p className="text-xs text-n-888 mt-1"><T>에이전트가 글마다 바꿔 적을 수도 있어요</T></p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-n-333 mb-1.5"><T>토큰 메모 (선택)</T></label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tx('예: 맥북 Claude Code')} maxLength={100} />
          </div>
          <div className="space-y-3">
            {SCOPE_GROUPS.map((g) => (
              <div key={g.label}>
                <p className="text-xs font-semibold text-n-666 mb-1.5"><T>{g.label}</T></p>
                <div className="space-y-1">
                  {g.scopes.map((sc) => (
                    <label key={sc.id} className="flex items-center gap-2 text-sm text-n-333">
                      <input type="checkbox" checked={scopes.includes(sc.id)} onChange={() => toggle(sc.id)} />
                      <span className="font-mono text-xs bg-n-f3f3f3 rounded px-1.5 py-0.5">{sc.id}</span>
                      <span className="text-n-666">{sc.label.replace(`${sc.id} — `, "")}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary btn-sm rounded-full" disabled={busy || scopes.length === 0}>
              <T>발급</T>
            </button>
          </div>
        </form>
      </details>

      <AdaptiveSheet open={Boolean(renaming)} onOpenChange={(o) => !o && setRenaming(null)} title={tx('에이전트 이름 바꾸기')}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void rename()
          }}
        >
          <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} autoFocus aria-label={tx('에이전트 이름')} />
          <p className="text-[12px] text-n-888"><T>이미 쓴 글에는 그때 이름이 그대로 남아요.</T></p>
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary btn-sm rounded-full min-h-[40px]" disabled={!newName.trim()}>
              <T>저장</T>
            </button>
          </div>
        </form>
      </AdaptiveSheet>
    </div>
  )
}
