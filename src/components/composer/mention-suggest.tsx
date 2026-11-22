'use client'

import { useCallback, useEffect, useId, useState, type KeyboardEvent, type RefObject } from 'react'
import { UserAvatar } from '@/components/user-avatar'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { applyMention, mentionQueryAt } from '@/lib/mention-rules'
import type { MentionSuggestion } from '@/lib/data/mention-suggest'
import { useT } from '@/i18n/client'

/** Set a controlled textarea's value the way typing does, so React's onChange fires. */
function setNativeValue(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** @-autocomplete for a composer textarea: members by @handle and listed agents as @handle.ai. */
export function useMentionSuggest(ref: RefObject<HTMLTextAreaElement | null>, enabled: boolean) {
  const t = useT()
  const listId = useId()
  const [token, setToken] = useState<{ start: number; query: string } | null>(null)
  const [items, setItems] = useState<MentionSuggestion[]>([])
  const [active, setActive] = useState(0)

  const update = useCallback(() => {
    const el = ref.current
    if (!enabled || !el) return
    const next = mentionQueryAt(el.value, el.selectionStart ?? el.value.length)
    setToken((prev) => (prev?.start === next?.start && prev?.query === next?.query ? prev : next))
  }, [enabled, ref])

  const query = token?.query
  useEffect(() => {
    if (query === undefined) return
    const ctl = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/mentions/suggest?q=${encodeURIComponent(query)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d: { items: MentionSuggestion[] }) => {
          setItems(d.items || [])
          setActive(0)
        })
        .catch(() => {})
    }, 120)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [query])

  const open = Boolean(token) && items.length > 0
  const close = useCallback(() => {
    setToken(null)
    setItems([])
  }, [])

  const pick = (item: MentionSuggestion) => {
    const el = ref.current
    if (!el || !token) return
    const r = applyMention(el.value, token.start, el.selectionStart ?? el.value.length, item)
    setNativeValue(el, r.text)
    el.focus()
    el.setSelectionRange(r.caret, r.caret)
    close()
  }

  /** true when the key was handled by the popover */
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open || e.metaKey || e.ctrlKey || e.nativeEvent.isComposing) return false
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(items[active])
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return true
    }
    return false
  }

  const optionId = (i: number) => `${listId}-o${i}`
  const inputProps = enabled
    ? {
        'aria-autocomplete': 'list' as const,
        'aria-expanded': open,
        'aria-controls': open ? listId : undefined,
        'aria-activedescendant': open ? optionId(active) : undefined,
      }
    : {}

  const popover = open ? (
    <ul id={listId} role="listbox" aria-label={t('언급할 사람이나 AI')} className="mention-pop">
      {items.map((it, i) => (
        <li
          key={`${it.kind}:${it.handle}`}
          id={optionId(i)}
          role="option"
          aria-selected={i === active}
          className={`mention-opt${i === active ? ' is-active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            pick(it)
          }}
          onMouseEnter={() => setActive(i)}
        >
          {it.kind === 'agent' ? <AgentAvatar name={it.name} avatarUrl={it.avatarUrl} size={24} /> : <UserAvatar id={it.handle} name={it.name} avatarUrl={it.avatarUrl} size="sm" />}
          <span className="mention-opt-name">{it.name}</span>
          {it.kind === 'agent' && <span className="agent-chip">AI</span>}
          <span className="mention-opt-handle">@{it.handle}{it.kind === 'agent' ? '.ai' : ''}</span>
        </li>
      ))}
    </ul>
  ) : null

  return { update, close, onKeyDown, popover, inputProps }
}
