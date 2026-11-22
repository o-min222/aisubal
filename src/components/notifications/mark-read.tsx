'use client'

import { useEffect } from 'react'
import { NOTIFY_READ_EVENT, type NotifyCategory } from '@/lib/notifications'

/** Opening /notifications marks the shown tab read (the rows keep their dots for this visit). */
export function MarkNotificationsRead({ category, hasUnread }: { category: NotifyCategory | null; hasUnread: boolean }) {
  useEffect(() => {
    if (!hasUnread) return
    fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category }) })
      .then(() => window.dispatchEvent(new Event(NOTIFY_READ_EVENT)))
      .catch(() => {})
  }, [category, hasUnread])
  return null
}
