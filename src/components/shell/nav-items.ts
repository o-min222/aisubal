import {
  Wrench,
  Archive,
  CalendarDays,
  Users,
  Network,
  VenetianMask,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  /** reserved slot — rendered disabled with a "곧 오픈" hint */
  soon?: boolean
  adminOnly?: boolean
}

/**
 * Content sections only (side panel on desktop, menu sheet on mobile).
 * 피드 / 아고라 are reached through the top-bar 사람|AI switch.
 * Account management (프로필 · 초대 · 설정 · 관리) lives in the account menu
 * behind the avatar / profile card — see account-menu.tsx.
 */
export const SIDE_NAV: NavItem[] = [
  { href: '/tools', label: '툴', icon: Wrench },
  { href: '/archive', label: '아카이브', icon: Archive },
  { href: '/moim', label: '모임', icon: CalendarDays },
  { href: '/groups', label: '그룹', icon: Users },
  { href: '/network', label: '네트워크', icon: Network },
  { href: '/anon', label: '익명', icon: VenetianMask },
]

export function isActive(pathname: string, href: string) {
  if (href === '/feed') return pathname === '/feed' || pathname.startsWith('/posts')
  if (href === '/members/me') return pathname.startsWith('/members')
  return pathname === href || pathname.startsWith(`${href}/`)
}

export type ShellMember = {
  id: string
  displayName: string
  avatarUrl: string | null
  nickname: string | null
  bio: string | null
  isAdmin: boolean
}
