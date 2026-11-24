import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DASHBOARD_TABS, networkHref } from '@/lib/dashboard-tabs'
import { parseManageTab, SOCIAL_TABS } from '@/lib/social-manage'

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')

// A70 (Colin t296u): the invite network lives in 친구·팔로워; the dashboard has no 네트워크 tab.
describe('invite network → 친구·팔로워', () => {
  it('every old network link lands on the matching 친구·팔로워 tab', () => {
    expect(networkHref()).toBe('/members/me/social?tab=invites')
    expect(networkHref({ root: 'abc' })).toBe('/members/me/social?tab=invites&root=abc')
    expect(networkHref({ view: 'graph', root: 'abc' })).toBe('/members/me/social?tab=invites&root=abc')
    expect(networkHref({ view: 'following', root: 'abc' })).toBe('/members/me/social?tab=following')
    expect(networkHref({ view: 'sent' })).toBe('/members/me/social?tab=requests')
    expect(networkHref({ view: 'requests' })).toBe('/members/me/social?tab=requests')
    expect(networkHref({ view: 'bogus' })).toBe('/members/me/social?tab=invites')
  })
  it('친구·팔로워 has the 초대 네트워크 tab, reachable by ?tab=invites (and the old ?view=graph name)', () => {
    expect(SOCIAL_TABS.map((t) => t.id)).toEqual(['friends', 'followers', 'following', 'requests', 'invites'])
    expect(parseManageTab('invites')).toBe('invites')
    expect(parseManageTab('graph')).toBe('invites')
    expect(parseManageTab('sent')).toBe('requests')
    expect(parseManageTab(undefined)).toBe('friends')
  })
  it('the dashboard tab is gone and /me?tab=network redirects (notification links from 0048 use it)', () => {
    expect(DASHBOARD_TABS.map((t) => t.id)).not.toContain('network')
    expect(read('src/app/(app)/me/page.tsx')).toMatch(/sp\.tab === 'network'\) redirect\(networkHref\(\{ view: sp\.view, root: sp\.root \}\)\)/)
    expect(read('src/app/(app)/me/page.tsx')).not.toMatch(/InviteGraph/)
  })
  it('A71: 초대 현황 is not a dashboard tab; /invites is its one home', () => {
    expect(DASHBOARD_TABS.map((t) => t.id)).not.toContain('invites')
    expect(read('src/app/(app)/me/page.tsx')).toMatch(/sp\.tab === 'invites'\) redirect\('\/invites'\)/)
    expect(read('src/app/(app)/invites/invites-client.tsx')).toMatch(/networkHref\(\)/)
  })
  it('초대 stays in the avatar menu', () => {
    expect(read('src/components/shell/account-menu.tsx')).toMatch(/href="\/invites"/)
  })
})
