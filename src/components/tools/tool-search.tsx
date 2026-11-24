'use client'

import { useId, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

/**
 * Gallery search: writes ?q= and keeps the other filters.
 * A84: tags live here instead of a chip row — focusing the box shows suggested tags (filtered by what
 * you type), tapping one sets ?tag= (deep links keep working), and the active tag is a removable chip
 * inside the box.
 */
export function ToolSearch({ initial, tags = [], activeTag = null }: { initial: string; tags?: string[]; activeTag?: string | null }) {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(initial)
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()

  function go(patch: { q?: string; tag?: string | null }) {
    const sp = new URLSearchParams(params.toString())
    if (patch.q !== undefined) {
      if (patch.q.trim()) sp.set('q', patch.q.trim())
      else sp.delete('q')
    }
    if (patch.tag !== undefined) {
      if (patch.tag) sp.set('tag', patch.tag)
      else sp.delete('tag')
    }
    sp.delete('page')
    sp.delete('open')
    router.push(`/gallery${sp.toString() ? `?${sp}` : ''}`, { scroll: false })
  }

  const needle = q.trim().replace(/^#/, '').toLowerCase()
  const suggestions = tags.filter((t) => t !== activeTag && (!needle || t.toLowerCase().includes(needle))).slice(0, 12)
  const show = open && suggestions.length > 0

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        setOpen(false)
        go({ q })
      }}
      className="tool-search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      <div className="tool-search-box" onClick={() => input.current?.focus()}>
        <Search className="w-4 h-4 flex-none text-n-888" aria-hidden />
        {activeTag && (
          <span className="tool-search-tag">
            #{activeTag}
            <button
              type="button"
              aria-label={tx('태그 #{tag} 해제', { tag: activeTag })}
              onClick={(e) => {
                e.stopPropagation()
                go({ tag: null })
              }}
            >
              <X className="w-3 h-3" aria-hidden />
            </button>
          </span>
        )}
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={activeTag ? tx('이 태그 안에서 검색') : tx('이름, 태그, 한 줄 소개')}
          aria-label={tx('갤러리 검색')}
          enterKeyHint="search"
          className="tool-search-input"
        />
        {q && (
          <button
            type="button"
            aria-label={tx('검색어 지우기')}
            onClick={(e) => {
              e.stopPropagation()
              setQ('')
              go({ q: '' })
            }}
            className="tool-search-clear"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>
      {show && (
        <div id={listId} className="tool-search-pop" role="group" aria-label={tx('추천 태그')}>
          <p className="tool-search-pop-title"><T>추천 태그</T></p>
          <div className="tool-search-pop-tags">
            {suggestions.map((t) => (
              <button
                key={t}
                type="button"
                className="tag-chip"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false)
                  // a tag replaces a half-typed search for it
                  const typedTag = needle && t.toLowerCase().includes(needle)
                  if (typedTag) setQ('')
                  go({ tag: t, ...(typedTag ? { q: '' } : {}) })
                  input.current?.blur()
                }}
              >
                #{t}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  )
}
