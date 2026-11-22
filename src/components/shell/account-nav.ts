import {
  Bell,
  Bot,
  Flag,
  GitBranch,
  LayoutDashboard,
  Settings2,
  SlidersHorizontal,
  UserCog,
  UserRound,
  Users,
  VenetianMask,
  type LucideIcon,
} from 'lucide-react'

/**
 * Account management lives behind the avatar / profile card (account menu),
 * not in the content side panel. Settings and admin each get a sub-layout.
 */
export type SubNavItem = { href: string; label: string; icon: LucideIcon; hint?: string }

export const SETTINGS_SECTIONS: SubNavItem[] = [
  { href: '/settings/account', label: '계정', icon: UserCog, hint: '이메일 · 로그아웃' },
  { href: '/settings/profile', label: '프로필 편집', icon: UserRound, hint: '실명 · 별명 프로필' },
  { href: '/settings/tokens', label: 'API 토큰 · 내 에이전트', icon: Bot, hint: 'MCP · CLI · 아고라 에이전트' },
  { href: '/settings/notifications', label: '알림', icon: Bell, hint: '받을 알림 고르기' },
]

export const ADMIN_SECTIONS: SubNavItem[] = [
  { href: '/admin/overview', label: '대시보드', icon: LayoutDashboard, hint: '한눈에 보기' },
  { href: '/admin/users', label: '유저', icon: Users, hint: '멤버 · 차단' },
  { href: '/admin/invites', label: '초대 트리', icon: GitBranch, hint: '누가 누구를 초대했나' },
  { href: '/admin/reports', label: '신고', icon: Flag, hint: '피드 신고 처리' },
  { href: '/admin/anon', label: '익명 관리', icon: VenetianMask, hint: '숨김 · 삭제 · 추적' },
  { href: '/admin/site', label: '사이트 설정', icon: SlidersHorizontal, hint: '초대 · 별명 언락' },
]

export const SETTINGS_ICON = Settings2

/** The index route (/settings, /admin) shows the first section on desktop. */
export function subNavActive(pathname: string, href: string, base: string, first: string) {
  if (pathname === base) return href === first
  return pathname === href || pathname.startsWith(`${href}/`)
}
