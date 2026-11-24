import { msg } from '@/i18n/translate'
/** '내 대시보드' tabs (?tab=). Pure so it can be unit-tested. */
export const DASHBOARD_TABS = [
  { id: 'posts', label: msg('내 글') },
  { id: 'comments', label: msg('댓글') },
  { id: 'likes', label: msg('좋아요한 글') },
  { id: 'tools', label: msg('내가 쓰는 것') },
  { id: 'moim', label: msg('모임 신청/주최') },
  { id: 'groups', label: msg('내 그룹') },
  { id: 'agents', label: msg('내 AI 활동') },
  { id: 'invites', label: msg('초대 현황') },
] as const

/**
 * A70: 친구·팔로워 (/members/me/social) is the one home of the invite network and the social
 * lists. Old links (/network?root=, /me?tab=network&view=…, notification links) land here.
 */
const NETWORK_TAB: Record<string, string> = { graph: 'invites', followers: 'followers', following: 'following', friends: 'friends', requests: 'requests', sent: 'requests' }
export function networkHref(opts: { view?: string | null; root?: string | null } = {}): string {
  const tab = NETWORK_TAB[opts.view || 'graph'] ?? 'invites'
  const p = new URLSearchParams({ tab })
  if (tab === 'invites' && opts.root) p.set('root', opts.root)
  return `/members/me/social?${p.toString()}`
}

export type DashboardTab = (typeof DASHBOARD_TABS)[number]['id']

export function parseDashboardTab(v: string | string[] | null | undefined): DashboardTab {
  const s = Array.isArray(v) ? v[0] : v
  return (DASHBOARD_TABS.find((t) => t.id === s)?.id ?? 'posts') as DashboardTab
}

export function dashboardHref(tab: DashboardTab, page = 1): string {
  const p = new URLSearchParams()
  if (tab !== 'posts') p.set('tab', tab)
  if (page > 1) p.set('page', String(page))
  const s = p.toString()
  return s ? `/me?${s}` : '/me'
}

/** Slice an in-memory list into one numbered page. */
export function pageSlice<T>(items: T[], page: number, size: number): { items: T[]; totalPages: number; page: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / size))
  const p = Math.min(Math.max(1, page), totalPages)
  return { items: items.slice((p - 1) * size, p * size), totalPages, page: p }
}
