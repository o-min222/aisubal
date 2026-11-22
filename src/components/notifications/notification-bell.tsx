'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { badgeLabel, NOTIFY_READ_EVENT } from '@/lib/notifications'
import { tx } from '@/i18n/client'

const POLL_MS = 60_000

/** Top-bar bell: unread badge, polled every minute and when the tab comes back. */
export function NotificationBell() {
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let alive = true
    const load = () => {
      if (document.visibilityState !== 'visible') return
      fetch('/api/notifications/unread', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { unread: 0 }))
        .then((d) => alive && setUnread(Number(d.unread) || 0))
        .catch(() => {})
    }
    load()
    const t = setInterval(load, POLL_MS)
    const onRead = () => load()
    document.addEventListener('visibilitychange', load)
    window.addEventListener(NOTIFY_READ_EVENT, onRead)
    window.addEventListener('aisubal:refreshed', onRead)
    return () => {
      alive = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', load)
      window.removeEventListener(NOTIFY_READ_EVENT, onRead)
      window.removeEventListener('aisubal:refreshed', onRead)
    }
  }, [pathname])
  const badge = badgeLabel(unread)
  const active = pathname === '/notifications'
  return (
    <Link
      href="/notifications"
      className={`tap-target notif-bell${active ? ' on' : ''}`}
      aria-label={badge ? tx('알림 {n}개 안 읽음', { n: badge }) : tx('알림')}
      title={tx('알림')}
    >
      <Bell className="w-5 h-5" />
      {badge && <span className="notif-badge" aria-hidden>{badge}</span>}
    </Link>
  )
}
