import {
  Bell,
  Bot,
  Flag,
  GitBranch,
  LayoutDashboard,
  ListChecks, PackageCheck,
  Settings2,
  SlidersHorizontal,
  Smartphone,
  UserCog,
  UserRound,
  Users,
  VenetianMask,
  Hourglass,
  type LucideIcon,
} from 'lucide-react'
import { msg } from '@/i18n/translate'

/**
 * Account management lives behind the avatar / profile card (account menu),
 * not in the content side panel. Settings and admin each get a sub-layout.
 */
export type SubNavItem = { href: string; label: string; icon: LucideIcon; hint?: string }

export const SETTINGS_SECTIONS: SubNavItem[] = [
  { href: '/settings/account', label: msg('계정'), icon: UserCog, hint: msg('이메일 · 언어 · 로그아웃') },
  { href: '/settings/profile', label: msg('프로필 편집'), icon: UserRound, hint: msg('닉네임 · @핸들 · 링크') },
  { href: '/agents', label: msg('내 에이전트'), icon: Bot, hint: msg('연결 · 이름 · 권한 · 서약 · 프로필 표시') },
  { href: '/settings/notifications', label: msg('알림'), icon: Bell, hint: msg('받을 알림 고르기') },
  { href: '/settings/app', label: msg('모바일 앱'), icon: Smartphone, hint: msg('홈 화면에 추가 · 폰으로 보내기') },
]

export const ADMIN_SECTIONS: SubNavItem[] = [
  { href: '/admin/overview', label: msg('대시보드'), icon: LayoutDashboard, hint: msg('한눈에 보기') },
  { href: '/admin/users', label: msg('유저'), icon: Users, hint: msg('멤버 · 차단') },
  { href: '/admin/invites', label: msg('초대 트리'), icon: GitBranch, hint: msg('누가 누구를 초대했나') },
  { href: '/admin/waitlist', label: msg('대기 명단'), icon: Hourglass, hint: msg('/join 신청 · 초대 코드') },
  { href: '/admin/tool-reviews', label: msg('갤러리 기록'), icon: ListChecks, hint: msg('바로 공개된 항목 · 자동으로 합친 중복') },
  { href: '/admin/installs', label: msg('설치 확인'), icon: PackageCheck, hint: msg('설치 명령 확인 · 공개') },
  { href: '/admin/reports', label: msg('신고'), icon: Flag, hint: msg('피드 신고 처리') },
  { href: '/admin/anon', label: msg('익명 관리'), icon: VenetianMask, hint: msg('숨김 · 삭제 · 추적') },
  { href: '/admin/site', label: msg('사이트 설정'), icon: SlidersHorizontal, hint: msg('초대 · 별명 언락') },
]

export const SETTINGS_ICON = Settings2

/** The index route (/settings, /admin) shows the first section on desktop. */
export function subNavActive(pathname: string, href: string, base: string, first: string) {
  if (pathname === base) return href === first
  return pathname === href || pathname.startsWith(`${href}/`)
}
