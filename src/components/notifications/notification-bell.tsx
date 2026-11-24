'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Settings } from 'lucide-react'
import { badgeLabel, NOTIFY_CATEGORIES, NOTIFY_READ_EVENT, type NotifyCategory } from '@/lib/notifications'
import { loadNotificationChunk } from '@/app/actions/notifications'
import { InfiniteList } from '@/components/infinite/infinite-list'
import { ChipBar } from '@/components/chip-bar'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'
import { publishFriendRequests } from '@/hooks/use-friend-requests'
import { useFriendRequestDelegate } from '@/hooks/use-friend-request-delegate'

const POLL_MS = 60_000

/**
 * Top-bar bell: unread badge (polled every minute and when the tab comes back) and a
 * non-modal layer popup under it: category chips, infinite list, marked read on open.
 * No backdrop; outside click / Esc / navigation closes it. /notifications stays as the full page.
 */
export function NotificationBell() {
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useFriendRequestDelegate() // A86: inline 수락/거절 on friend-request rows (popover and /notifications)

  const loadCount = useCallback(() => {
    if (document.visibilityState !== 'visible') return
    fetch('/api/notifications/unread', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { unread: 0, requests: 0 }))
      .then((d) => {
        setUnread(Number(d.unread) || 0)
        publishFriendRequests(Number(d.requests) || 0) // A86: avatar dot + 친구·팔로워 row
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    loadCount()
    const t = setInterval(loadCount, POLL_MS)
    document.addEventListener('visibilitychange', loadCount)
    window.addEventListener(NOTIFY_READ_EVENT, loadCount)
    window.addEventListener('aisubal:refreshed', loadCount)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', loadCount)
      window.removeEventListener(NOTIFY_READ_EVENT, loadCount)
      window.removeEventListener('aisubal:refreshed', loadCount)
    }
  }, [pathname, loadCount])

  // close on navigation
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const badge = badgeLabel(unread)
  const active = open || pathname === '/notifications'
  return (
    <div ref={wrap} className="notif-wrap">
      <button
        type="button"
        className={`tap-target notif-bell${active ? ' on' : ''}`}
        aria-label={badge ? tx('알림 {n}개 안 읽음', { n: badge }) : tx('알림')}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={tx('알림')}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="w-5 h-5" />
        {badge && <span className="notif-badge" aria-hidden>{badge}</span>}
      </button>
      {open && <NotificationPopover hadUnread={unread > 0} onClose={() => setOpen(false)} />}
    </div>
  )
}

function NotificationPopover({ hadUnread, onClose }: { hadUnread: boolean; onClose: () => void }) {
  const [category, setCategory] = useState<NotifyCategory | null>(null)
  const marked = useRef(false)
  const load = useCallback(
    async (page: number) => {
      const c = await loadNotificationChunk(category, page)
      // mark read once the first page is on screen (rows keep their dots for this visit)
      if (page === 1 && hadUnread && !marked.current) {
        marked.current = true
        fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: null }) })
          .then(() => window.dispatchEvent(new Event(NOTIFY_READ_EVENT)))
          .catch(() => {})
      }
      if (c.empty) return { nodes: <p className="notif-pop-empty">{category ? <T>이 종류의 알림이 아직 없어요.</T> : <T>아직 알림이 없어요.</T>}</p>, hasMore: false }
      return c
    },
    [category, hadUnread]
  )
  return (
    <div className="notif-pop" role="dialog" aria-label={tx('알림')}>
      <div className="notif-pop-head">
        <span className="notif-pop-title"><T>알림</T></span>
        <Link href="/settings/notifications" onClick={onClose} className="notif-pop-icon" aria-label={tx('알림 설정')} title={tx('알림 설정')}>
          <Settings className="w-[18px] h-[18px]" />
        </Link>
      </div>
      <ChipBar as="div" role="radiogroup" label={tx('알림 종류')} className="notif-pop-chips">
        <button type="button" role="radio" aria-checked={!category} className={`filter-chip is-sm whitespace-nowrap ${!category ? 'on' : ''}`} onClick={() => setCategory(null)}>
          <T>전체</T>
        </button>
        {NOTIFY_CATEGORIES.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={category === c.id} className={`filter-chip is-sm whitespace-nowrap ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)}>
            <T>{c.label}</T>
          </button>
        ))}
      </ChipBar>
      <div className="notif-pop-list">
        <InfiniteList key={category ?? 'all'} load={load} endLabel={null} skeleton={4} />
      </div>
      <Link href="/notifications" onClick={onClose} className="notif-pop-all">
        <T>알림 전체 보기</T>
      </Link>
    </div>
  )
}
