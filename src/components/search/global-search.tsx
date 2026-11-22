'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Bot, FileText, Loader2, Search, User, Wrench } from 'lucide-react'
import type { SearchHit, SearchResults } from '@/lib/data/search'
import { useT } from '@/i18n/client'

const GROUPS = [
  { key: 'people', label: '사람', Icon: User },
  { key: 'feed', label: '피드', Icon: FileText },
  { key: 'agora', label: '아고라', Icon: Bot },
  { key: 'gallery', label: '갤러리', Icon: Wrench },
] as const

/**
 * Top-bar search: a compact field with a ⌘K hint on desktop, an icon on mobile. Both open
 * the same quick-results dialog; Enter (or '모두 보기') goes to /search.
 */
export function GlobalSearch() {
  const t = useT()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [res, setRes] = useState<SearchResults | null>(null)
  const [busy, setBusy] = useState(false)
  const [mac, setMac] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const term = q.trim()
    if (!open || !term) {
      setRes(null)
      return
    }
    const ctl = new AbortController()
    const timer = setTimeout(async () => {
      setBusy(true)
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        if (r.ok) setRes((await r.json()) as SearchResults)
      } catch {
        /* aborted or offline: keep the last results */
      } finally {
        setBusy(false)
      }
    }, 180)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [q, open])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }
  const all = `/search?q=${encodeURIComponent(q.trim())}`
  const total = res ? res.people.length + res.feed.length + res.agora.length + res.gallery.length : 0

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger className="gsearch-field only-desktop" aria-label={t('검색')}>
        <Search aria-hidden />
        <span className="gsearch-ph">{t('검색')}</span>
        <kbd className="gsearch-kbd">{mac ? '⌘K' : 'Ctrl K'}</kbd>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Trigger className="gsearch-icon tap-target only-mobile" aria-label={t('검색')}>
        <Search aria-hidden />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="gsearch-backdrop" />
        <DialogPrimitive.Popup className="gsearch-pop" initialFocus={inputRef}>
          <DialogPrimitive.Title className="sr-only">{t('검색')}</DialogPrimitive.Title>
          <form
            className="gsearch-input-row"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              if (q.trim()) go(all)
            }}
          >
            <Search aria-hidden />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('사람 · 글 · 갤러리 검색')}
              aria-label={t('검색어')}
              maxLength={60}
              enterKeyHint="search"
            />
            {busy && <Loader2 className="animate-spin" aria-hidden />}
          </form>
          <div className="gsearch-body">
            {!q.trim() ? (
              <p className="gsearch-hint">{t('닉네임, 피드·아고라 글, 갤러리 이름으로 찾아요. 익명 게시판은 검색되지 않아요.')}</p>
            ) : res && total === 0 && !busy ? (
              <p className="gsearch-hint">{t('‘{q}’에 맞는 결과가 없어요.', { q: q.trim() })}</p>
            ) : (
              res &&
              GROUPS.map(({ key, label, Icon }) =>
                res[key].length ? (
                  <section key={key} className="gsearch-group">
                    <h3>{t(label)}</h3>
                    <ul>
                      {res[key].map((h: SearchHit) => (
                        <li key={h.id}>
                          <Link href={h.href} onClick={() => setOpen(false)} className="gsearch-hit">
                            <Icon aria-hidden />
                            <span className="min-w-0">
                              <b>{h.title}</b>
                              {h.sub && <small>{h.sub}</small>}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null,
              )
            )}
          </div>
          {q.trim() && (
            <Link href={all} onClick={() => setOpen(false)} className="gsearch-all">
              {t('‘{q}’ 모든 결과 보기', { q: q.trim() })}
            </Link>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
