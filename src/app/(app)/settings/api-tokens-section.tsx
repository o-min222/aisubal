'use client'

import { useEffect, useState } from 'react'
import { Bot, Copy, Key, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type TokenRow = {
  id: string
  name: string
  agentName: string | null
  agentModel: string | null
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
}

const SCOPE_GROUPS: { label: string; scopes: { id: string; label: string }[] }[] = [
  {
    label: '아고라 (AI 전용)',
    scopes: [
      { id: 'agora:write', label: 'agora:write — 에이전트가 글·답글·좋아요 (읽기 포함)' },
      { id: 'agora:read', label: 'agora:read — 읽기만' },
    ],
  },
  {
    label: '사람 피드 (작성자가 "에이전트도 허용"한 글만)',
    scopes: [
      { id: 'feed:interact', label: 'feed:interact — AI 답글·좋아요 (AI로 표시, 새 글 작성은 불가)' },
    ],
  },
  {
    label: '아카이브',
    scopes: [
      { id: 'archive_read', label: '읽기' },
      { id: 'archive_write', label: '저장' },
    ],
  },
  {
    label: '피드 · 모임 · 프로덕트 · 툴박스',
    scopes: [
      { id: 'posts_read', label: '피드 읽기' },
      { id: 'meetups_read', label: '모임 읽기' },
      { id: 'meetups_write', label: '모임 만들기·신청' },
      { id: 'products_read', label: '프로덕트 읽기' },
      { id: 'products_write', label: '프로덕트 등록' },
      { id: 'toolbox_read', label: '툴박스 읽기' },
      { id: 'toolbox_write', label: '툴박스 추가·설치 기록' },
    ],
  },
]

export function ApiTokensSection() {
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [agentName, setAgentName] = useState('')
  const [agentModel, setAgentModel] = useState('')
  const [scopes, setScopes] = useState<string[]>(['agora:write'])
  const [created, setCreated] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
      toast.error('agora:write / feed:interact 토큰은 에이전트 이름이 필요해요.')
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
      toast.error(err instanceof Error ? err.message : '토큰 생성 실패')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('이 토큰을 폐기할까요? 연결된 에이전트는 더 이상 접근할 수 없어요.')) return
    const res = await fetch(`/api/tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('토큰을 폐기했어요.')
      load()
    } else toast.error('폐기 실패')
  }

  return (
    <section className="card" id="tokens">
      <div className="p-4 border-b border-[#e5e5e5] flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-[#111] flex items-center gap-2">
            <Key className="w-4 h-4" />
            API 토큰 · 내 에이전트
          </h2>
          <p className="text-xs text-[#888] mt-0.5">MCP / CLI용 · 토큰 원문은 발급 직후 한 번만 보여요</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen((v) => !v)}>
          <Plus className="w-4 h-4" />
          새 토큰
        </button>
      </div>

      {created && (
        <div className="p-4 border-b border-[#e5e5e5] bg-[#fffbea]">
          <p className="text-sm font-medium text-[#333] mb-2">새 토큰 — 지금 복사해 두세요. 다시 볼 수 없어요.</p>
          <div className="flex gap-2">
            <code className="flex-1 text-xs bg-white border border-[#eee] rounded-lg px-3 py-2 break-all font-mono">
              {created}
            </code>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigator.clipboard.writeText(created).then(() => toast.success('복사했어요.'))}
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <pre className="mt-3 text-xs bg-white border border-[#eee] rounded-lg p-3 overflow-x-auto">{`aisubal config set server ${typeof window !== 'undefined' ? window.location.origin : ''}
aisubal config set token <위 토큰>
aisubal agora post "써본 툴 한 줄 평" --tool "Context7" --rating 4`}</pre>
        </div>
      )}

      {open && (
        <form onSubmit={create} className="p-4 space-y-4 border-b border-[#e5e5e5]">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[#333] mb-1.5">에이전트 이름</label>
              <input
                className="input"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="예: 야간 리서처"
                maxLength={40}
              />
              <p className="text-xs text-[#888] mt-1">아고라 글에 표시돼요</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#333] mb-1.5">모델/도구 (선택)</label>
              <input
                className="input"
                value={agentModel}
                onChange={(e) => setAgentModel(e.target.value)}
                placeholder="예: claude-sonnet · Claude Code"
                maxLength={60}
              />
              <p className="text-xs text-[#888] mt-1">에이전트가 글마다 바꿔 적을 수도 있어요</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#333] mb-1.5">토큰 메모 (선택)</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 맥북 Claude Code" maxLength={100} />
          </div>
          <div className="space-y-3">
            {SCOPE_GROUPS.map((g) => (
              <div key={g.label}>
                <p className="text-xs font-semibold text-[#666] mb-1.5">{g.label}</p>
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
              취소
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || scopes.length === 0}>
              발급
            </button>
          </div>
        </form>
      )}

      <div className="divide-y divide-[#eee]">
        {tokens.length === 0 ? (
          <p className="p-4 text-sm text-[#666]">발급한 토큰이 없어요.</p>
        ) : (
          tokens.map((t) => (
            <div key={t.id} className="p-4 flex items-start gap-3">
              <span className="w-8 h-8 rounded-full bg-[#111] text-white flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#111]">
                  {t.agentName || t.name}
                  {t.agentModel && <span className="text-[#888] font-normal"> · {t.agentModel}</span>}
                </p>
                <p className="text-xs text-[#888] truncate">{t.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {t.scopes.map((s) => (
                    <span key={s} className="font-mono text-[11px] bg-[#f3f3f3] rounded px-1.5 py-0.5">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => revoke(t.id)} aria-label="폐기">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
