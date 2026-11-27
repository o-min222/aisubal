import { msg as M } from '@/i18n/translate'
/**
 * 모임 rules. The database (0007 moim_* RPCs) is the source of truth in
 * production; these pure functions mirror it for the DEV mock and tests.
 *
 * - First-come mode: confirmed while seats remain, then waitlisted (FIFO).
 * - Host-approval mode: pending → host approves (confirmed, or waitlisted when full) / rejects.
 * - A freed seat (cancel / remove / capacity increase) auto-promotes the waitlist in order.
 * - Exact place, map link and online link are shown only to managers and confirmed attendees.
 */
export type MoimMode = 'offline' | 'online'
export type RsvpStatus = 'pending' | 'confirmed' | 'waitlisted' | 'rejected' | 'cancelled' | 'interested'
export type MoimStatus = 'open' | 'closed' | 'cancelled' | 'past'
export type MoimQuestion = { id: string; label: string; required: boolean }
export type MoimRsvp = {
  id: string
  memberId: string
  status: RsvpStatus
  answers: Record<string, string>
  note: string | null
  createdAt: string
  waitlistedAt: string | null
  decidedAt: string | null
}
export type DecideAction = 'approve' | 'waitlist' | 'reject' | 'remove'

export const MAX_QUESTIONS = 5

export function normalizeQuestions(input: unknown): MoimQuestion[] {
  if (!Array.isArray(input)) return []
  const out: MoimQuestion[] = []
  for (const q of input) {
    if (out.length >= MAX_QUESTIONS) break
    const label = typeof q?.label === 'string' ? q.label.trim() : ''
    if (label.length < 1 || label.length > 120) continue
    out.push({ id: `q${out.length + 1}`, label, required: Boolean(q?.required) })
  }
  return out
}

export function validateAnswers(
  questions: MoimQuestion[],
  answers: Record<string, unknown> | null | undefined
): { ok: true; answers: Record<string, string> } | { ok: false; error: 'moim_answer_required' } {
  const clean: Record<string, string> = {}
  for (const q of questions) {
    const v = String(answers?.[q.id] ?? '').trim().slice(0, 500)
    if (q.required && !v) return { ok: false, error: 'moim_answer_required' }
    if (v) clean[q.id] = v
  }
  return { ok: true, answers: clean }
}

export const countStatus = (rsvps: MoimRsvp[], s: RsvpStatus) => rsvps.filter((r) => r.status === s).length

export function decideOnApply(m: { requiresApproval: boolean; capacity: number }, rsvps: MoimRsvp[]): RsvpStatus {
  if (m.requiresApproval) return 'pending'
  return countStatus(rsvps, 'confirmed') < m.capacity ? 'confirmed' : 'waitlisted'
}

function waitOrder(a: MoimRsvp, b: MoimRsvp) {
  return (a.waitlistedAt || a.createdAt).localeCompare(b.waitlistedAt || b.createdAt) || a.createdAt.localeCompare(b.createdAt)
}

/** Fill free seats from the waitlist in order. Returns the new list and promoted ids. */
export function promoteWaitlist(capacity: number, rsvps: MoimRsvp[], now = new Date().toISOString()) {
  const free = capacity - countStatus(rsvps, 'confirmed')
  if (free <= 0) return { rsvps, promoted: [] as string[] }
  const promoted = rsvps.filter((r) => r.status === 'waitlisted').sort(waitOrder).slice(0, free).map((r) => r.id)
  return {
    rsvps: rsvps.map((r) => (promoted.includes(r.id) ? { ...r, status: 'confirmed' as const, decidedAt: now } : r)),
    promoted,
  }
}

export function waitlistPosition(rsvps: MoimRsvp[], rsvpId: string): number | null {
  const list = rsvps.filter((r) => r.status === 'waitlisted').sort(waitOrder)
  const i = list.findIndex((r) => r.id === rsvpId)
  return i < 0 ? null : i + 1
}

export type ApplyBlock =
  | 'moim_closed'
  | 'moim_deadline_passed'
  | 'moim_host_cannot_apply'
  | 'moim_members_only'
  | 'moim_rejected'

export function applyBlock(
  m: { status: MoimStatus; startsAt: string; applyDeadline: string | null; isHost: boolean; membersOnly: boolean; groupId: string | null },
  ctx: { isGroupMember: boolean; myStatus: RsvpStatus | null },
  now = new Date()
): ApplyBlock | null {
  if (m.status !== 'open' || Date.parse(m.startsAt) < now.getTime()) return 'moim_closed'
  if (m.applyDeadline && Date.parse(m.applyDeadline) < now.getTime()) return 'moim_deadline_passed'
  if (m.isHost) return 'moim_host_cannot_apply'
  if (m.membersOnly && m.groupId && !ctx.isGroupMember) return 'moim_members_only'
  if (ctx.myStatus === 'rejected') return 'moim_rejected'
  return null
}

/** 관심 does not take a seat, so the apply deadline does not block it. */
export function interestBlock(
  m: { status: MoimStatus; startsAt: string; isHost: boolean; membersOnly: boolean; groupId: string | null },
  ctx: { isGroupMember: boolean; myStatus: RsvpStatus | null },
  now = new Date()
): ApplyBlock | 'moim_already_applied' | null {
  if (m.status !== 'open' || Date.parse(m.startsAt) < now.getTime()) return 'moim_closed'
  if (m.isHost) return 'moim_host_cannot_apply'
  if (m.membersOnly && m.groupId && !ctx.isGroupMember) return 'moim_members_only'
  if (ctx.myStatus === 'rejected') return 'moim_rejected'
  if (ctx.myStatus === 'pending' || ctx.myStatus === 'confirmed' || ctx.myStatus === 'waitlisted') return 'moim_already_applied'
  return null
}

export function decideRsvp(
  capacity: number,
  rsvps: MoimRsvp[],
  rsvpId: string,
  action: DecideAction,
  now = new Date().toISOString()
): { ok: true; status: RsvpStatus; rsvps: MoimRsvp[]; promoted: string[] } | { ok: false; error: 'moim_full' | 'moim_invalid_action' } {
  const r = rsvps.find((x) => x.id === rsvpId)
  if (!r) return { ok: false, error: 'moim_invalid_action' }
  let next: RsvpStatus
  if (action === 'approve' && (r.status === 'pending' || r.status === 'waitlisted')) {
    if (countStatus(rsvps, 'confirmed') < capacity) next = 'confirmed'
    else if (r.status === 'pending') next = 'waitlisted'
    else return { ok: false, error: 'moim_full' }
  } else if (action === 'waitlist' && r.status === 'pending') next = 'waitlisted'
  else if (action === 'reject' && (r.status === 'pending' || r.status === 'waitlisted')) next = 'rejected'
  else if (action === 'remove' && r.status === 'confirmed') next = 'rejected'
  else return { ok: false, error: 'moim_invalid_action' }
  let list = rsvps.map((x) =>
    x.id === rsvpId ? { ...x, status: next, decidedAt: now, waitlistedAt: next === 'waitlisted' ? now : x.waitlistedAt } : x
  )
  let promoted: string[] = []
  if (r.status === 'confirmed') ({ rsvps: list, promoted } = promoteWaitlist(capacity, list, now))
  return { ok: true, status: next, rsvps: list, promoted }
}

export function canSeePrivate(canManage: boolean, myStatus: RsvpStatus | null | undefined) {
  return canManage || myStatus === 'confirmed'
}

export const RSVP_LABEL: Record<RsvpStatus, string> = {
  pending: M('승인 대기'),
  confirmed: M('참석 확정'),
  waitlisted: M('대기 중'),
  rejected: M('거절됨'),
  cancelled: M('취소함'),
  interested: M('관심'),
}

export const MOIM_ERRORS: Record<string, string> = {
  moim_closed: '신청이 마감된 모임이에요.',
  moim_deadline_passed: '신청 기한이 지났어요.',
  moim_host_cannot_apply: '내가 연 모임에는 신청할 수 없어요.',
  moim_members_only: '이 그룹 멤버만 신청할 수 있어요.',
  moim_rejected: '호스트가 이 신청을 거절했어요.',
  moim_already_applied: '이미 참석 신청한 모임이에요. 관심을 표시하려면 먼저 신청을 취소해 주세요.',
  moim_answer_required: '필수 질문에 답해주세요.',
  moim_full: '정원이 가득 찼어요. 정원을 늘리거나 대기열로 두세요.',
  moim_invalid_action: '지금 상태에서는 할 수 없는 작업이에요.',
  moim_forbidden: '이 모임을 관리할 권한이 없어요.',
  moim_group_forbidden: '내가 운영자(소유자·매니저)인 그룹으로만 모임을 열 수 있어요.',
  moim_not_found: '모임을 찾을 수 없어요.',
  moim_daily_limit: '하루에 만들 수 있는 모임 수를 넘었어요.',
  moim_invalid_title: '제목은 2~80자로 입력해주세요.',
  moim_invalid_description: '소개는 4000자 이내로 적어주세요.',
  moim_invalid_time: '날짜·시간을 확인해주세요 (시작은 지금 이후, 종료는 시작 이후).',
  moim_invalid_deadline: '신청 마감은 시작 시간보다 앞이어야 해요.',
  moim_invalid_capacity: '정원은 1~500명이에요.',
  moim_invalid_url: '링크는 http(s)://로 시작해야 해요.',
  moim_capacity_below_confirmed: '확정된 인원보다 정원을 줄일 수 없어요.',
  moim_rsvp_not_found: '신청 내역이 없어요.',
  moim_host_seat: '호스트 자리는 뺄 수 없어요. 모임을 열지 않으려면 ‘모임 취소’를 눌러 주세요.',
  moim_invalid_mode: '온라인/오프라인을 선택해주세요.',
  moim_too_many_invites: '초대는 한 번에 30명까지예요.',
}

export function moimErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  const key = Object.keys(MOIM_ERRORS).find((k) => msg.includes(k))
  return key ? MOIM_ERRORS[key] : M('처리하지 못했어요.')
}
