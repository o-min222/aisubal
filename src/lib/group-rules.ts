import { msg as M } from '@/i18n/translate'
export type GroupRole = 'owner' | 'mod' | 'member'
export type GroupMemberStatus = 'active' | 'pending' | 'invited'
export type JoinPolicy = 'open' | 'approval'

export const GROUP_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/

/** Mirrors 0060 group__slug_from: latin words of the name, else 'group'; a short suffix when taken. */
export function uniqueGroupSlug(name: string, taken: (slug: string) => boolean): string {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/g, '')
  if (!GROUP_SLUG_RE.test(base)) base = 'group'
  let cand = base
  for (let i = 0; cand === 'group' || ['new', 'admin', 'settings'].includes(cand) || taken(cand); i++) {
    cand = `${base}-${Math.random().toString(36).slice(2, i < 10 ? 6 : 10)}`
  }
  return cand
}

export function slugify(name: string): string {
  const ascii = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '')
  if (GROUP_SLUG_RE.test(ascii)) return ascii
  // names without latin letters (e.g. '실전 모임') still get a usable address to start from
  const t = name.trim()
  if (!t) return ''
  let h = 0
  for (const c of t) h = (h * 31 + c.codePointAt(0)!) >>> 0
  const fallback = `group-${h.toString(36).slice(0, 6)}`
  return GROUP_SLUG_RE.test(fallback) ? fallback : ''
}

export const ROLE_LABEL: Record<GroupRole, string> = { owner: M('소유자'), mod: M('매니저'), member: M('멤버') }

export const canModerate = (role: GroupRole | null | undefined) => role === 'owner' || role === 'mod'

/** Who can remove whom: owner → anyone but self; mod → plain members only. */
export function canRemove(myRole: GroupRole | null, theirRole: GroupRole, isSelf: boolean): boolean {
  if (isSelf || theirRole === 'owner' || !myRole) return false
  if (myRole === 'owner') return true
  return myRole === 'mod' && theirRole === 'member'
}

/** Timeline readable by non-members only when the group is open and listed. */
export function canReadTimeline(g: { joinPolicy: JoinPolicy; isHidden: boolean }, myStatus: GroupMemberStatus | null) {
  return myStatus === 'active' || (g.joinPolicy === 'open' && !g.isHidden)
}

const GROUP_ERRORS: Record<string, string> = {
  group_invalid_name: '그룹 이름은 2~40자로 입력해주세요.',
  group_invalid_slug: '주소는 영문 소문자·숫자·하이픈 2~40자로 입력해주세요.',
  group_slug_taken: '이미 쓰는 주소예요. 다른 주소를 입력해주세요.',
  group_invalid_policy: '가입 방식을 선택해주세요.',
  group_daily_limit: '오늘은 더 이상 만들거나 초대할 수 없어요.',
  group_not_found: '그룹을 찾을 수 없어요.',
  group_forbidden: '권한이 없어요.',
  group_owner_cannot_leave: '소유자는 나갈 수 없어요. 먼저 소유권을 넘기거나 그룹을 삭제하세요.',
  group_request_not_found: '가입 요청을 찾을 수 없어요.',
  group_member_not_found: '멤버를 찾을 수 없어요.',
  group_invalid_role: '바꿀 수 없는 역할이에요.',
}

export function groupErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  const key = Object.keys(GROUP_ERRORS).find((k) => msg.includes(k))
  return key ? GROUP_ERRORS[key] : M('처리하지 못했어요.')
}
