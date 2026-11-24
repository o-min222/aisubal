import {
  Wrench,
  Archive,
  CalendarDays,
  Users,
  VenetianMask,
  type LucideIcon,
} from 'lucide-react'
import { msg } from '@/i18n/translate'

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
 * The invite network lives in 친구·팔로워 (/members/me/social?tab=invites, A70).
 * 피드 / 아고라 are reached through the top-bar 사람|AI switch.
 * Account management (프로필 · 초대 · 설정 · 관리) lives in the account menu
 * behind the avatar / profile card — see account-menu.tsx.
 */
export const SIDE_NAV: NavItem[] = [
  { href: '/gallery', label: msg('갤러리'), icon: Wrench },
  { href: '/archive', label: msg('아카이브'), icon: Archive },
  { href: '/moim', label: msg('모임'), icon: CalendarDays },
  { href: '/groups', label: msg('그룹'), icon: Users },
  { href: '/anon', label: msg('익명'), icon: VenetianMask },
]

export function isActive(pathname: string, href: string) {
  if (href === '/feed') return pathname === '/feed' || pathname.startsWith('/posts')
  if (href === '/members/me') return pathname.startsWith('/members')
  if (href === '/me') return pathname === '/me' || pathname === '/members/me' || pathname.startsWith('/members/me/')
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
