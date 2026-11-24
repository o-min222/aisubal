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
  // A86: pending friend requests (their rows exist only while pending) are pinned to the top of page 1 and
  // skipped in the regular stream, so they never sink under newer comments and likes.
  const pinRequests = category === null || category === 'social'
  const [d, pinned] = await Promise.all([
    listNotifications({ category, offset: (p - 1) * NOTIFY_PAGE, limit: NOTIFY_PAGE }),
    pinRequests && p === 1
      ? listNotifications({ category: 'social', offset: 0, limit: 100 }).then((r) => r.items.filter((n) => n.kind === 'friend_request')).catch(() => [])
      : Promise.resolve([]),
  ])
  const items = [...pinned, ...(pinRequests ? d.items.filter((n) => n.kind !== 'friend_request') : d.items)]
  return {
    nodes: items.length ? (
      <ul className="divide-y divide-n-f0f0f0">
        {items.map((n) => (
          <li key={n.id}>
            <NotificationRow n={n} />
          </li>
        ))}
      </ul>
    ) : null,
    hasMore: p * NOTIFY_PAGE < d.total,
    unread: d.unread,
    empty: p === 1 && items.length === 0,
  }
}
