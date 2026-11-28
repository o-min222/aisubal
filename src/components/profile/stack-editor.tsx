'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Plus, Search } from 'lucide-react'
import { type LinkVisibility } from '@/lib/profile-rules'
import { SKILL_TYPES, suggestionMatches, type StackGroup } from '@/lib/profile-stack'
import { T } from '@/i18n/t'
import { ServiceIcon } from '@/components/service-chip'
import { tx } from '@/i18n/client'

export type Item = { label: string; entryId: string | null; iconUrl?: string | null; slug?: string; visibility?: LinkVisibility | null; /** skills: a '사용 중' catalog tool (tool_users), not free text */ used?: boolean }
type CatalogHit = { id: string; slug: string; name: string; icon_url: string | null; type: string }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

/**
 * Searchable picker: 툴 catalog hits + quick picks + free-text fallback.
 * `inline` (A90, the 추가 sheet): one flat surface — the search stays on top, every quick pick
 * is listed and the list scrolls inside; items already added show a check.
 */
export function Picker({ onPick, suggestions, skillsOnly, placeholder, disabled, inline, taken }: { onPick: (i: Item) => void; suggestions: readonly string[]; skillsOnly?: boolean; placeholder: string; disabled?: boolean; inline?: boolean; taken?: string[] }) {
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
  const quick = suggestions.filter((s) => !term || suggestionMatches(s, term)).slice(0, inline ? undefined : 6)
  const isTaken = (label: string) => (taken ?? []).some((t) => norm(t) === norm(label))
  const show = inline || open
  const shownHits = term ? hits : []
  function pick(i: Item) {
    onPick(i)
    setQ('')
    setOpen(false)
  }
  return (
    <div ref={box} className={inline ? 'stack-pick is-inline' : 'relative'}>
      <div className="stack-pick-search flex items-center gap-2 rounded-lg border border-n-ddd px-2.5 min-h-[42px] bg-n-fff">
        <Search className="w-4 h-4 text-n-999 flex-shrink-0" />
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
      {show && (shownHits.length > 0 || quick.length > 0 || term) && (
        <ul className={inline ? 'stack-pick-list' : 'stack-pick-menu'} role="listbox" aria-label={placeholder}>
          {shownHits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => pick({ label: h.name, entryId: h.id, iconUrl: h.icon_url, slug: h.slug })}>
                <ServiceIcon label={h.name} iconUrl={h.icon_url} />
                <span className="truncate">{h.name}</span>
                <span className="ml-auto text-[11px] text-n-999"><T>갤러리</T></span>
              </button>
            </li>
          ))}
          {quick.map((s) => {
            const done = isTaken(s)
            return (
              <li key={s}>
                <button type="button" disabled={done} aria-disabled={done} onClick={() => pick({ label: s, entryId: null })}>
                  {inline && <ServiceIcon label={s} iconUrl={null} />}
                  <span className="truncate">{s}</span>
                  {done && <Check className="w-4 h-4 ml-auto text-n-888" aria-label={tx('추가됨')} />}
                </button>
              </li>
            )
          })}
          {term && !quick.some((s) => norm(s) === norm(term)) && !shownHits.some((h) => norm(h.name) === norm(term)) && (
            <li>
              <button type="button" onClick={() => pick({ label: term.slice(0, 60), entryId: null })}>
                <Plus className="w-4 h-4" /> <T s="‘{term}’ 직접 추가" vars={{ term: term.slice(0, 60) }} />
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}



export type StackEditorInitial = {
  ai: Item[]
  subs: Item[]
  /** catalog skills from '사용 중' (tool_users) */
  usedSkills: Item[]
  skillExtras: string[]
  /** A90: the skills row in its saved order (used + extras); falls back to used-then-extras */
  skills?: Item[]
  vis: Record<StackGroup, LinkVisibility>
}

