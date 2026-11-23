'use client'

import { useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { MentionSuggestion } from '@/lib/data/mention-suggest'
import { mergeSuggestions, rankLocal } from '@/lib/mention-rules'
import { MAX_INVITES, normalizeInvites } from '@/lib/moim-thread-rules'
import { loadCircle } from '@/components/composer/mention-suggest'
import { UserAvatar } from '@/components/user-avatar'
import { tx } from '@/i18n/client'

type Person = Pick<MentionSuggestion, 'handle' | 'name' | 'avatarUrl'>

/**
 * A29: people to invite, as removable @chips. Same instant autocomplete as the composers (A27):
 * the viewer's circle is filtered locally as you type; anyone else joins ~100ms later from search.
 * Members only — agents can't come to a 모임.
 */
export function InviteInput({ value, onChange }: { value: Person[]; onChange: (v: Person[]) => void }) {
  const listId = useId()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState(0)
  const [circle, setCircle] = useState<MentionSuggestion[]>([])
  const [remote, setRemote] = useState<{ q: string; items: MentionSuggestion[] }>({ q: '', items: [] })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ctl = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = text.trim().replace(/^@+/, '')
  const chosen = new Set(value.map((p) => p.handle.toLowerCase()))
  const members = (xs: MentionSuggestion[]) => xs.filter((x) => x.kind === 'member' && !chosen.has(x.handle.toLowerCase()))
  const local = rankLocal(members(circle), query, 6)
  const items = query ? mergeSuggestions(local, remote.q === query ? members(remote.items) : [], 6) : []
  const full = value.length >= MAX_INVITES
  // only once something is typed (like @ in the composers): an idle list would cover the submit button
  const show = open && !full && items.length > 0
  const active = Math.min(cur, Math.max(0, items.length - 1))

  function warm() {
    loadCircle().then(setCircle)
  }
  function search(q: string) {
    if (timer.current) clearTimeout(timer.current)
    ctl.current?.abort()
    if (!q) return
    timer.current = setTimeout(() => {
      const c = new AbortController()
      ctl.current = c
      fetch(`/api/mentions/suggest?q=${encodeURIComponent(q)}`, { signal: c.signal })
        .then((r) => r.json())
        .then((d) => setRemote({ q, items: d.items || [] }))
        .catch(() => {})
    }, 100)
  }
  function add(p: Person) {
    if (full || chosen.has(p.handle.toLowerCase())) return
    onChange([...value, p])
    setText('')
    setCur(0)
    inputRef.current?.focus()
  }
  /** Enter / comma on a typed handle nobody matched: keep it as typed (the server checks it). */
  function addTyped() {
    const [h] = normalizeInvites([query])
    if (h) add({ handle: h, name: h, avatarUrl: null })
  }
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' && show) {
      e.preventDefault()
      setCur((active + 1) % items.length)
    } else if (e.key === 'ArrowUp' && show) {
      e.preventDefault()
      setCur((active - 1 + items.length) % items.length)
    } else if (e.key === 'Enter' || e.key === ',') {
      if (!query) return
      e.preventDefault() // never submit the form from here
      if (show) add(items[active])
      else addTyped()
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="invite-input relative">
      <div className="invite-box" onClick={() => inputRef.current?.focus()}>
        {value.map((p) => (
          <span key={p.handle} className="invite-chip">
            <span className="truncate">@{p.handle}</span>
            <button type="button" className="invite-chip-x" aria-label={tx('{name} 초대 빼기', { name: `@${p.handle}` })} onClick={() => onChange(value.filter((x) => x.handle !== p.handle))}>
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id="m-invite"
          value={text}
          disabled={full}
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={show ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={value.length ? '' : tx('@이름 또는 핸들')}
          onFocus={() => {
            warm()
            setOpen(true)
          }}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
            setCur(0)
            search(e.target.value.trim().replace(/^@+/, ''))
          }}
          onCompositionEnd={(e) => search(e.currentTarget.value.trim().replace(/^@+/, ''))}
          onKeyDown={onKey}
        />
      </div>
      {show && (
        <ul id={listId} role="listbox" aria-label={tx('초대할 사람')} className="invite-pop">
          {items.map((it, i) => (
            <li
              key={it.handle}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`mention-opt${i === active ? ' is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault() // keep focus in the input
                add(it)
              }}
              onMouseEnter={() => setCur(i)}
            >
              <UserAvatar id={it.handle} name={it.name} avatarUrl={it.avatarUrl} size="sm" />
              <span className="mention-opt-name">{it.name}</span>
              <span className="mention-opt-handle">@{it.handle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
