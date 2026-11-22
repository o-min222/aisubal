'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { LINK_VISIBILITY, type LinkVisibility } from '@/lib/profile-rules'
import { AI_SUGGESTIONS, STACK_GROUP_LABEL, STACK_LIMIT, SUB_SUGGESTIONS, SKILL_TYPES, type StackGroup } from '@/lib/profile-stack'

type Item = { label: string; entryId: string | null; iconUrl?: string | null; slug?: string }
type CatalogHit = { id: string; slug: string; name: string; icon_url: string | null; type: string }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

/** Searchable picker: 툴 catalog hits + quick picks + free-text fallback. */
function Picker({ onPick, suggestions, skillsOnly, placeholder, disabled }: { onPick: (i: Item) => void; suggestions: string[]; skillsOnly?: boolean; placeholder: string; disabled?: boolean }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<CatalogHit[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const term = q.trim()
    if (term.length < 1) return
    const t = setTimeout(() => {
      fetch(`/api/tools?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : { tools: [] }))
        .then((d: { tools?: CatalogHit[] }) => setHits((d.tools || []).filter((h) => !skillsOnly || SKILL_TYPES.includes(h.type)).slice(0, 6)))
        .catch(() => setHits([]))
    }, 220)
    return () => clearTimeout(t)
  }, [q, skillsOnly])
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const term = q.trim()
  const quick = suggestions.filter((s) => !term || norm(s).includes(norm(term))).slice(0, 6)
  const shownHits = term ? hits : []
  function pick(i: Item) {
    onPick(i)
    setQ('')
    setOpen(false)
  }
  return (
    <div ref={box} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-[#ddd] px-2.5 min-h-[42px] bg-white">
        <Search className="w-4 h-4 text-[#999] flex-shrink-0" />
        <input
          value={q}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && term) {
              e.preventDefault()
              const hit = shownHits.find((h) => norm(h.name) === norm(term))
              pick(hit ? { label: hit.name, entryId: hit.id, iconUrl: hit.icon_url, slug: hit.slug } : { label: term.slice(0, 60), entryId: null })
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 text-[14.5px] outline-none bg-transparent"
          aria-label={placeholder}
        />
      </div>
      {open && (shownHits.length > 0 || quick.length > 0 || term) && (
        <ul className="stack-pick-menu" role="listbox">
          {shownHits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => pick({ label: h.name, entryId: h.id, iconUrl: h.icon_url, slug: h.slug })}>
                <span className="mc-chip-icon" style={{ background: '#111' }}>{h.name.charAt(0).toUpperCase()}</span>
                <span className="truncate">{h.name}</span>
                <span className="ml-auto text-[11px] text-[#999]">툴</span>
              </button>
            </li>
          ))}
          {quick.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => pick({ label: s, entryId: null })}>
                <span className="truncate">{s}</span>
              </button>
            </li>
          ))}
          {term && !quick.some((s) => norm(s) === norm(term)) && !shownHits.some((h) => norm(h.name) === norm(term)) && (
            <li>
              <button type="button" onClick={() => pick({ label: term.slice(0, 60), entryId: null })}>
                <Plus className="w-4 h-4" /> ‘{term.slice(0, 60)}’ 직접 추가
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function Chips({ items, onRemove }: { items: Item[]; onRemove: (i: number) => void }) {
  if (!items.length) return <p className="text-[12.5px] text-[#999]">아직 없어요.</p>
  return (
    <ul className="mc-chips">
      {items.map((it, i) => (
        <li key={`${it.label}-${i}`}>
          <span className="mc-chip pr-1">
            <span className="mc-chip-icon" style={{ background: it.entryId ? '#111' : '#888' }} aria-hidden>
              {it.label.charAt(0).toUpperCase()}
            </span>
            <span className="truncate">{it.label}</span>
            <button type="button" onClick={() => onRemove(i)} className="inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-[#eee]" aria-label={`${it.label} 빼기`}>
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}

function VisSelect({ value, onChange, label }: { value: LinkVisibility; onChange: (v: LinkVisibility) => void; label: string }) {
  return (
    <select aria-label={`${label} 공개 범위`} value={value} onChange={(e) => onChange(e.target.value as LinkVisibility)} className="rounded-lg border border-[#ddd] bg-white px-2 text-[13px] min-h-[36px]">
      {LINK_VISIBILITY.map((v) => (
        <option key={v.id} value={v.id}>
          {v.label}
        </option>
      ))}
    </select>
  )
}

export type StackEditorInitial = {
  ai: Item[]
  subs: Item[]
  /** catalog skills from '사용 중' (tool_users) */
  usedSkills: Item[]
  skillExtras: string[]
  vis: Record<StackGroup, LinkVisibility>
}

/** 설정 › 프로필 편집: 활용하는 AI / 구독 중인 서비스 / 스킬·플러그인·MCP. */
export function StackEditor({ initial }: { initial: StackEditorInitial }) {
  const router = useRouter()
  const [ai, setAi] = useState<Item[]>(initial.ai)
  const [subs, setSubs] = useState<Item[]>(initial.subs)
  const [used, setUsed] = useState<Item[]>(initial.usedSkills)
  const [extras, setExtras] = useState<Item[]>(initial.skillExtras.map((label) => ({ label, entryId: null })))
  const [vis, setVis] = useState(initial.vis)
  const [busy, setBusy] = useState(false)

  const add = (list: Item[], set: (v: Item[]) => void) => (i: Item) => {
    if (list.length >= STACK_LIMIT) return toast.error(`${STACK_LIMIT}개까지 추가할 수 있어요.`)
    if (list.some((x) => (i.entryId && x.entryId === i.entryId) || norm(x.label) === norm(i.label))) return
    set([...list, i])
  }

  // catalog skills write straight to '사용 중' so the 툴 pages stay the single source of truth
  async function toggleUsage(item: Item, using: boolean) {
    if (!item.entryId) return
    const res = await fetch(`/api/tools/${item.entryId}/usage`, { method: using ? 'POST' : 'DELETE' })
    if (!res.ok) return toast.error('사용 중 표시를 바꾸지 못했어요.')
    setUsed(using ? [...used.filter((u) => u.entryId !== item.entryId), item] : used.filter((u) => u.entryId !== item.entryId))
    toast.success(using ? `‘${item.label}’ 사용 중으로 표시했어요` : `‘${item.label}’ 사용 중 표시를 뺐어요`)
  }

  async function save() {
    setBusy(true)
    try {
      const strip = (l: Item[]) => l.map(({ label, entryId }) => ({ label, entryId }))
      const res = await fetch('/api/profile/stack', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai: strip(ai), subs: strip(subs), skills: strip(extras), vis }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || '저장하지 못했어요.')
      toast.success('AI 스택을 저장했어요')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  const head = (g: StackGroup, hint: string) => (
    <div className="flex items-center gap-2 justify-between">
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold" style={{ color: '#111' }}>
          {STACK_GROUP_LABEL[g]}
        </h3>
        <p className="text-[12px] text-[#888]">{hint}</p>
      </div>
      <VisSelect value={vis[g]} onChange={(v) => setVis({ ...vis, [g]: v })} label={STACK_GROUP_LABEL[g]} />
    </div>
  )

  return (
    <section id="stack" className="card p-4 space-y-5 scroll-mt-20" aria-label="AI 스택">
      <div>
        <h2 className="text-[15px] font-bold" style={{ color: '#111' }}>
          AI 스택
        </h2>
        <p className="text-[12px] text-[#777]">프로필 카드에 아이콘 칩으로 보여요. 묶음마다 공개 범위를 정할 수 있어요.</p>
      </div>
      <div className="space-y-2">
        {head('ai', 'Claude, ChatGPT, Gemini, Cursor…')}
        <Chips items={ai} onRemove={(i) => setAi(ai.filter((_, j) => j !== i))} />
        <Picker onPick={add(ai, setAi)} suggestions={AI_SUGGESTIONS} placeholder="AI 검색 또는 직접 입력" />
      </div>
      <div className="space-y-2">
        {head('subs', 'ChatGPT Plus, Claude Max, Cursor Pro…')}
        <Chips items={subs} onRemove={(i) => setSubs(subs.filter((_, j) => j !== i))} />
        <Picker onPick={add(subs, setSubs)} suggestions={SUB_SUGGESTIONS} placeholder="구독 서비스 검색 또는 직접 입력" />
      </div>
      <div className="space-y-2">
        {head('skills', '툴에서 고르면 ‘사용 중’으로 바로 표시돼요. 목록에 없으면 직접 입력.')}
        <Chips items={[...used, ...extras]} onRemove={(i) => (i < used.length ? toggleUsage(used[i], false) : setExtras(extras.filter((_, j) => j !== i - used.length)))} />
        <Picker
          skillsOnly
          suggestions={[]}
          placeholder="스킬·플러그인·MCP 검색"
          onPick={(i) => (i.entryId ? toggleUsage(i, true) : add(extras, setExtras)(i))}
        />
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={busy} className="btn btn-primary btn-sm min-h-[40px] rounded-full">
          {busy ? '저장 중…' : 'AI 스택 저장'}
        </button>
      </div>
    </section>
  )
}
