import { msg } from '@/i18n/translate'
/** '내 대시보드' tabs (?tab=). Pure so it can be unit-tested. */
export const DASHBOARD_TABS = [
  { id: 'posts', label: msg('내 글') },
  // second, so the invite graph / social lists are on screen without scrolling the strip
  { id: 'network', label: msg('네트워크') },
  { id: 'comments', label: msg('댓글') },
  { id: 'likes', label: msg('좋아요한 글') },
  { id: 'tools', label: msg('내가 쓰는 것') },
  { id: 'moim', label: msg('모임 신청/주최') },
  { id: 'groups', label: msg('내 그룹') },
  { id: 'agents', label: msg('내 AI 활동') },
  { id: 'invites', label: msg('초대 현황') },
] as const

/** 네트워크 tab sub-views (?view=): invite graph + social lists. */
export const NETWORK_VIEWS = [
  { id: 'graph', label: msg('초대 그래프') },
  { id: 'followers', label: msg('팔로워') },
  { id: 'following', label: msg('팔로잉') },
  { id: 'friends', label: msg('친구') },
  { id: 'requests', label: msg('받은 요청') },
  { id: 'sent', label: msg('보낸 요청') },
] as const
export type NetworkView = (typeof NETWORK_VIEWS)[number]['id']

export function parseNetworkView(v: string | string[] | null | undefined): NetworkView {
  const s = Array.isArray(v) ? v[0] : v
  return (NETWORK_VIEWS.find((t) => t.id === s)?.id ?? 'graph') as NetworkView
}

/** /network?root=X (old URL) and graph links → dashboard 네트워크 tab. */
export function networkHref(opts: { view?: NetworkView; root?: string | null } = {}): string {
  const p = new URLSearchParams({ tab: 'network' })
  if (opts.view && opts.view !== 'graph') p.set('view', opts.view)
  if (opts.root) p.set('root', opts.root)
  return `/me?${p.toString()}`
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
