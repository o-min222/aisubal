'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { UserAvatar } from '@/components/user-avatar'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { applyMention, mentionQueryAt, mergeSuggestions, placeMentionPopover, rankLocal } from '@/lib/mention-rules'
import type { MentionSuggestion } from '@/lib/data/mention-suggest'
import { useT } from '@/i18n/client'

/** Set a controlled textarea's value the way typing does, so React's onChange fires. */
function setNativeValue(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

// A27: the viewer's circle, shared by every composer on the page; refreshed after a minute
let circle: { at: number; items: MentionSuggestion[] } | null = null
let circleLoading: Promise<MentionSuggestion[]> | null = null
export function loadCircle(): Promise<MentionSuggestion[]> {
  if (circle && Date.now() - circle.at < 60_000) return Promise.resolve(circle.items)
  circleLoading ??= fetch('/api/mentions/suggest?circle=1')
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((d: { items?: MentionSuggestion[] }) => {
      circle = { at: Date.now(), items: d.items || [] }
      return circle.items
    })
    .catch(() => circle?.items ?? [])
    .finally(() => {
      circleLoading = null
    })
  return circleLoading
}

const MIRRORED = ['boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'textIndent', 'wordSpacing', 'tabSize'] as const

/** Viewport coordinates of the caret line in a textarea (mirror-div technique). */
function caretRect(el: HTMLTextAreaElement, pos: number): { x: number; top: number; bottom: number } {
  const cs = getComputedStyle(el)
  const m = document.createElement('div')
  for (const k of MIRRORED) m.style[k] = cs[k]
  Object.assign(m.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: cs.wordBreak, overflow: 'hidden', height: 'auto' })
  m.textContent = el.value.slice(0, pos)
  const mark = document.createElement('span')
  mark.textContent = el.value.slice(pos, pos + 1) || '.'
  m.appendChild(mark)
  document.body.appendChild(m)
  const r = el.getBoundingClientRect()
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4
  const top = r.top + mark.offsetTop - el.scrollTop
  const x = r.left + mark.offsetLeft - el.scrollLeft
  m.remove()
  return { x, top, bottom: top + lh }
}

/** @-autocomplete for a composer textarea: members by @handle and listed agents as @handle.ai. */
export function useMentionSuggest(ref: RefObject<HTMLTextAreaElement | null>, enabled: boolean) {
  const t = useT()
  const listId = useId()
  const popRef = useRef<HTMLUListElement>(null)
  const [token, setToken] = useState<{ start: number; query: string } | null>(null)
  const [known, setKnown] = useState<MentionSuggestion[] | null>(() => circle?.items ?? null)
  const [remote, setRemote] = useState<{ q: string; items: MentionSuggestion[] }>({ q: '', items: [] })
  const [active, setActive] = useState(0)

  const update = useCallback(() => {
    const el = ref.current
    if (!enabled || !el) return
    const next = mentionQueryAt(el.value, el.selectionStart ?? el.value.length)
    setToken((prev) => (prev?.start === next?.start && prev?.query === next?.query ? prev : next))
  }, [enabled, ref])

  /** warm the circle as soon as the box is focused, so the first @ answers instantly */
  const prefetch = useCallback(() => {
    if (enabled) void loadCircle().then(setKnown)
  }, [enabled])

  const query = token?.query
  // the first @ before the circle arrived (no focus event, e.g. autofocus): fetch it now
  useEffect(() => {
    if (query !== undefined && !known) void loadCircle().then(setKnown)
  }, [query, known])
  // everyone else: a server search 100ms after typing stops; stale requests are aborted
  useEffect(() => {
    if (!query) return
    const ctl = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/mentions/suggest?q=${encodeURIComponent(query)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d: { items?: MentionSuggestion[] }) => setRemote({ q: query, items: d.items || [] }))
        .catch(() => {})
    }, 100)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [query])

  // instant: the circle filtered as you type; server hits join once they answer for this query
  const local = token && known ? rankLocal(known, token.query) : []
  const items = token ? mergeSuggestions(local, remote.q === token.query ? remote.items : []) : []
  const open = Boolean(token) && items.length > 0
  const cur = Math.max(0, Math.min(active, items.length - 1))

  // anchor under the caret; flip above near the bottom / the phone keyboard
  const place = useCallback(() => {
    const el = ref.current
    const pop = popRef.current
    if (!el || !pop || !token) return
    const caret = caretRect(el, token.start)
    const vv = window.visualViewport
    const vp = vv ? { left: vv.offsetLeft, top: vv.offsetTop, w: vv.width, h: vv.height } : { left: 0, top: 0, w: window.innerWidth, h: window.innerHeight }
    const p = placeMentionPopover(caret, { w: pop.offsetWidth, h: pop.offsetHeight }, vp)
    Object.assign(pop.style, { left: `${p.left}px`, top: `${p.top}px`, visibility: 'visible' })
    pop.classList.toggle('is-above', p.above)
  }, [ref, token])
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place, items.length])
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    vv?.addEventListener('resize', place)
    vv?.addEventListener('scroll', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      vv?.removeEventListener('resize', place)
      vv?.removeEventListener('scroll', place)
    }
  }, [open, place])

  const close = useCallback(() => {
    setToken(null)
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
      setActive((i) => (Math.min(i, items.length - 1) + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(items[cur])
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
        'aria-activedescendant': open ? optionId(cur) : undefined,
      }
    : {}

  // a portal, so a sheet's transform or overflow can't clip or shift it
  const popover =
    open && typeof document !== 'undefined'
      ? createPortal(
          <ul
            ref={popRef}
            id={listId}
            role="listbox"
            aria-label={t('언급할 사람이나 AI')}
            className="mention-pop"
            style={{ visibility: 'hidden', left: 0, top: 0 }}
          >
            {items.map((it, i) => (
              <li
                key={`${it.kind}:${it.handle}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === cur}
                className={`mention-opt${i === cur ? ' is-active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(it)
                }}
                onMouseEnter={() => setActive(i)}
              >
                {it.kind === 'agent' ? <AgentAvatar name={it.name} brand={it.brand} avatarUrl={it.avatarUrl} size={24} /> : <UserAvatar id={it.handle} name={it.name} avatarUrl={it.avatarUrl} size="sm" />}
                <span className="mention-opt-name">{it.name}</span>
                {it.kind === 'agent' && <span className="agent-chip">AI</span>}
                <span className="mention-opt-handle">@{it.handle}{it.kind === 'agent' ? '.ai' : ''}</span>
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null

  return { update, close, prefetch, onKeyDown, popover, inputProps }
}
