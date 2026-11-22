import { msg } from '@/i18n/translate'
export type GroupRole = 'owner' | 'mod' | 'member'
export type GroupMemberStatus = 'active' | 'pending' | 'invited'
export type JoinPolicy = 'open' | 'approval'

export const GROUP_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/

export function slugify(name: string): string {
  const ascii = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
  return GROUP_SLUG_RE.test(ascii) ? ascii : ''
}

export const ROLE_LABEL: Record<GroupRole, string> = { owner: msg('소유자'), mod: msg('매니저'), member: msg('멤버') }

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

export const GROUP_ERRORS: Record<string, string> = {
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
  return key ? GROUP_ERRORS[key] : '처리하지 못했어요.'
}
