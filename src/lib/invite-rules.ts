/**
 * Invite system rules for AI쓰발.
 *
 * - Each completed member holds N codes, N = admin setting site_config.invites_per_member (0085);
 *   when all N have joined, the next N arrive at once (no time-based renewal)
 * - Codes become active only after their creator completed signup
 * - Codes are single-use (consumed on successful signup)
 * - No grace period
 * - Founder/admin bootstrap members get active codes immediately
 */

type InviteCodeRecord = {
  code: string
  created_by_id: string
  used_by_id: string | null
  used_at: string | null
}

type MemberRecord = {
  id: string
  signup_completed_at: string | null
  is_admin?: boolean
}

/** Fallback only, when the admin setting is missing (the database's invites__allowance() uses the same). */
export const INVITES_PER_MEMBER = 5

export function isInviteCodeActive(
  code: InviteCodeRecord,
  creator: MemberRecord | null | undefined
): boolean {
  if (!creator) return false
  if (!creator.signup_completed_at) return false
  return true
}

export function canRedeemInviteCode(
  code: InviteCodeRecord,
  creator: MemberRecord | null | undefined
): { ok: true } | { ok: false; reason: string } {
  if (!code) {
    return { ok: false, reason: '존재하지 않는 초대 코드입니다.' }
  }
  if (code.used_by_id || code.used_at) {
    return { ok: false, reason: '이미 사용된 초대 코드입니다.' }
  }
  if (!isInviteCodeActive(code, creator)) {
    return { ok: false, reason: '아직 활성화되지 않은 초대 코드입니다.' }
  }
  return { ok: true }
}

export function shouldGateToWaitlist(args: {
  isAuthenticated: boolean
  member: MemberRecord | null
}): 'unauthenticated' | 'waitlist' | 'member' {
  if (!args.isAuthenticated) return 'unauthenticated'
  if (args.member?.signup_completed_at) return 'member'
  return 'waitlist'
}

export function validateInviteCodeCount(codes: InviteCodeRecord[]): boolean {
  return codes.length === INVITES_PER_MEMBER
}

export function consumeInviteCode(
  code: InviteCodeRecord,
  usedById: string,
  usedAt: string
): InviteCodeRecord {
  return {
    ...code,
    used_by_id: usedById,
    used_at: usedAt,
  }
}

export function createInactiveCodesForMember(memberId: string, codes: string[]): InviteCodeRecord[] {
  return codes.map((code) => ({
    code,
    created_by_id: memberId,
    used_by_id: null,
    used_at: null,
  }))
}
