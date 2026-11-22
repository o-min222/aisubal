'use server'

import { listNotifications } from '@/lib/data/notifications'
import { parseNotifyCategory } from '@/lib/notifications'
import { NotificationRow } from '@/components/notifications/notification-row'
import type { Chunk } from '@/components/infinite/infinite-list'

const NOTIFY_PAGE = 20

/** One page of the signed-in member's notifications (the /notifications page and the bell popover). */
export async function loadNotificationChunk(rawCategory: string | null, page: number): Promise<Chunk & { unread: number; empty: boolean }> {
  const category = parseNotifyCategory(rawCategory ?? undefined)
  const p = Math.max(1, Math.floor(Number(page)) || 1)
  const d = await listNotifications({ category, offset: (p - 1) * NOTIFY_PAGE, limit: NOTIFY_PAGE })
  return {
    nodes: d.items.length ? (
      <ul className="divide-y divide-n-f0f0f0">
        {d.items.map((n) => (
          <li key={n.id}>
            <NotificationRow n={n} />
          </li>
        ))}
      </ul>
    ) : null,
    hasMore: p * NOTIFY_PAGE < d.total,
    unread: d.unread,
    empty: p === 1 && d.items.length === 0,
  }
}
