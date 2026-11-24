import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cardSlice, dismissKey, isDismissed, FRIEND_REQUESTS_HREF } from '@/lib/friend-requests'
import { pushPayload, type PushJob } from '@/lib/push-rules'

const root = join(__dirname, '..')
const src = (p: string) => readFileSync(join(root, p), 'utf8')

describe('A86 · incoming friend requests', () => {
  it('the feed card shows 3 rows then "N개 더" (counting requests beyond the list it got)', () => {
    expect(cardSlice(['a', 'b'], 2)).toEqual({ shown: ['a', 'b'], more: 0 })
    expect(cardSlice(['a', 'b', 'c', 'd', 'e'], 5)).toEqual({ shown: ['a', 'b', 'c'], more: 2 })
    expect(cardSlice(['a', 'b', 'c'], 9).more).toBe(6)
  })

  it('dismissing hides the card until a request that was not there arrives', () => {
    const stored = dismissKey(['m2', 'm1'])
    expect(stored).toBe('m1,m2')
    expect(isDismissed(['m1', 'm2'], stored)).toBe(true)
    expect(isDismissed(['m1'], stored)).toBe(true) // one answered elsewhere: still dismissed
    expect(isDismissed(['m1', 'm3'], stored)).toBe(false) // new request brings it back
    expect(isDismissed(['m1'], null)).toBe(false)
  })

  it('push says what it is and what to do, and opens the requests list', () => {
    const job = {
      outboxId: 1, subscriptionId: 's', endpoint: 'https://x', p256dh: 'p', auth: 'a', locale: 'ko', unread: 2,
      item: { id: 'n1', kind: 'friend_request', category: 'social', link: '/me?tab=network&view=requests', excerpt: null, targetKind: 'member', count: 1, createdAt: new Date().toISOString(), unread: true, actor: { kind: 'member', id: 'm1', name: '새벽CTO', avatarUrl: null }, targetId: 'm1' },
    } as unknown as PushJob
    const p = pushPayload(job, (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? '')))
    expect(p.title).toBe('새 친구 신청')
    expect(p.body).toBe('새벽CTO님이 친구 신청을 보냈어요. 눌러서 수락하거나 거절해 주세요.')
    expect(p.url).toBe(FRIEND_REQUESTS_HREF)
    expect(p.badge).toBe(2)
  })

  it('notification rows answer inline (actions outside the link) and link straight to the requests list', () => {
    const row = src('src/components/notifications/notification-row.tsx')
    expect(row).toMatch(/n\.kind === 'friend_request' \? FRIEND_REQUESTS_HREF : n\.link/)
    const link = row.indexOf('const row = (')
    const actions = row.indexOf('<FriendRequestInline')
    expect(actions).toBeGreaterThan(row.indexOf('</Link>', link)) // never nested inside the <Link>
    // server-action-rendered rows carry no new client component (page client manifests may lack it)
    expect(row).not.toMatch(/from '@\/components\/social\//)
    expect(src('src/components/notifications/notification-bell.tsx')).toMatch(/useFriendRequestDelegate\(\)/)
  })

  it('the count reaches the avatar and 친구·팔로워 row, and the feed shows the card', () => {
    expect(src('src/app/api/notifications/unread/route.ts')).toMatch(/requests/)
    expect(src('src/components/notifications/notification-bell.tsx')).toMatch(/publishFriendRequests\(/)
    const menu = src('src/components/shell/account-menu.tsx')
    expect(menu).toMatch(/account-dot/)
    expect(menu).toMatch(/requests > 0 \? FRIEND_REQUESTS_HREF/)
    const feed = src('src/app/(app)/feed/page.tsx')
    expect(feed.indexOf('<FriendRequestsCard')).toBeGreaterThan(feed.indexOf('<QuickComposer'))
    expect(src('src/components/social/social-manager.tsx')).toMatch(/className="sm-inbox"/)
  })
})

describe('A86 · requests pinned in the notification list', () => {
  it('page 1 starts with every pending request; the regular stream skips them', () => {
    const a = src('src/app/actions/notifications.tsx')
    expect(a).toMatch(/pinRequests && p === 1/)
    expect(a).toMatch(/const items = \[\.\.\.pinned, \.\.\.\(pinRequests \? d\.items\.filter\(\(n\) => n\.kind !== 'friend_request'\)/)
  })
})
