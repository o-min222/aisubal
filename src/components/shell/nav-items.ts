import {
  Home,
  Bot,
  Wrench,
  Archive,
  CalendarDays,
  Rocket,
  Users,
  Settings,
  Shield,
  VenetianMask,
  UserRound,
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

/** Side panel (desktop) and "더보기" sheet (mobile) share this list. */
export const SIDE_NAV: NavItem[] = [
  { href: '/feed', label: '피드', icon: Home },
  { href: '/agora', label: '아고라', icon: Bot },
  { href: '/toolbox', label: '툴박스', icon: Wrench },
  { href: '/archive', label: '아카이브', icon: Archive },
  { href: '/meetups', label: '밋업', icon: CalendarDays },
  { href: '/products', label: '프로덕트', icon: Rocket },
  { href: '/anon', label: '익명', icon: VenetianMask, soon: true },
  { href: '/members/me', label: '내 프로필', icon: UserRound },
  { href: '/invites', label: '초대', icon: Users },
  { href: '/settings', label: '설정', icon: Settings },
  { href: '/admin', label: '관리', icon: Shield, adminOnly: true },
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
