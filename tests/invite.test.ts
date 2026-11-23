import { describe, it, expect } from 'vitest'
import {
  INVITES_PER_MEMBER,
  canRedeemInviteCode,
  consumeInviteCode,
  createInactiveCodesForMember,
  isInviteCodeActive,
  shouldGateToWaitlist,
  validateInviteCodeCount,
} from '@/lib/invite-rules'

describe('초대 코드 활성화 규칙', () => {
  const unusedCode = {
    code: 'ABCD1234',
    created_by_id: 'creator-1',
    used_by_id: null,
    used_at: null,
  }

  it('가입 완료한 멤버의 코드만 활성화된다', () => {
    expect(
      isInviteCodeActive(unusedCode, {
        id: 'creator-1',
        signup_completed_at: '2026-01-01T00:00:00Z',
      })
    ).toBe(true)

    expect(
      isInviteCodeActive(unusedCode, {
        id: 'creator-1',
        signup_completed_at: null,
      })
    ).toBe(false)
  })

  it('창립자/관리자도 signup_completed_at이 있어야 코드가 활성이다', () => {
    expect(
      isInviteCodeActive(unusedCode, {
        id: 'founder',
        signup_completed_at: '2026-01-01T00:00:00Z',
        is_admin: true,
      })
    ).toBe(true)
  })
})

describe('단일 사용 초대 코드', () => {
  it('이미 사용된 코드는 재사용할 수 없다', () => {
    const used = {
      code: 'USED9999',
      created_by_id: 'creator-1',
      used_by_id: 'member-2',
      used_at: '2026-02-01T00:00:00Z',
    }

    const result = canRedeemInviteCode(used, {
      id: 'creator-1',
      signup_completed_at: '2026-01-01T00:00:00Z',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('이미 사용된')
    }
  })

  it('사용 가능한 코드는 소모된다', () => {
    const unused = {
      code: 'FREE1234',
      created_by_id: 'creator-1',
      used_by_id: null,
      used_at: null,
    }

    const redeem = canRedeemInviteCode(unused, {
      id: 'creator-1',
      signup_completed_at: '2026-01-01T00:00:00Z',
    })
    expect(redeem.ok).toBe(true)

    const consumed = consumeInviteCode(unused, 'member-9', '2026-03-01T00:00:00Z')
    expect(consumed.used_by_id).toBe('member-9')
    expect(consumed.used_at).toBe('2026-03-01T00:00:00Z')

    const again = canRedeemInviteCode(consumed, {
      id: 'creator-1',
      signup_completed_at: '2026-01-01T00:00:00Z',
    })
    expect(again.ok).toBe(false)
  })

  it('비활성 코드는 사용할 수 없다', () => {
    const unused = {
      code: 'WAIT0001',
      created_by_id: 'creator-1',
      used_by_id: null,
      used_at: null,
    }

    const result = canRedeemInviteCode(unused, {
      id: 'creator-1',
      signup_completed_at: null,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('활성화되지 않은')
    }
  })
})

describe('멤버당 초대 수 (기본 5, 관리자 설정이 우선)', () => {
  it('멤버는 설정 수(기본 5)만큼 초대 코드를 가진다', () => {
    const codes = createInactiveCodesForMember('member-1', ['AAAA1111', 'BBBB2222', 'CCCC3333', 'DDDD4444', 'EEEE5555'])
    expect(INVITES_PER_MEMBER).toBe(5)
    expect(codes).toHaveLength(INVITES_PER_MEMBER)
    expect(validateInviteCodeCount(codes)).toBe(true)
  })

  it('0·1·2·4개는 유효하지 않다', () => {
    expect(validateInviteCodeCount([])).toBe(false)
    expect(
      validateInviteCodeCount([
        { code: 'A', created_by_id: 'm', used_by_id: null, used_at: null },
      ])
    ).toBe(false)
    expect(
      validateInviteCodeCount([
        { code: 'A', created_by_id: 'm', used_by_id: null, used_at: null },
        { code: 'B', created_by_id: 'm', used_by_id: null, used_at: null },
        { code: 'C', created_by_id: 'm', used_by_id: null, used_at: null },
        { code: 'D', created_by_id: 'm', used_by_id: null, used_at: null },
      ])
    ).toBe(false)
    expect(
      validateInviteCodeCount([
        { code: 'A', created_by_id: 'm', used_by_id: null, used_at: null },
        { code: 'B', created_by_id: 'm', used_by_id: null, used_at: null },
      ])
    ).toBe(false)
  })
})

describe('웨이트리스트 게이팅', () => {
  it('비로그인 사용자는 unauthenticated', () => {
    expect(
      shouldGateToWaitlist({ isAuthenticated: false, member: null })
    ).toBe('unauthenticated')
  })

  it('로그인했지만 초대 미사용이면 waitlist', () => {
    expect(
      shouldGateToWaitlist({
        isAuthenticated: true,
        member: null,
      })
    ).toBe('waitlist')

    expect(
      shouldGateToWaitlist({
        isAuthenticated: true,
        member: { id: 'm1', signup_completed_at: null },
      })
    ).toBe('waitlist')
  })

  it('초대 코드를 사용해 가입 완료한 사용자만 member', () => {
    expect(
      shouldGateToWaitlist({
        isAuthenticated: true,
        member: { id: 'm1', signup_completed_at: '2026-01-01T00:00:00Z' },
      })
    ).toBe('member')
  })
})

describe('그레이스 기간 없음', () => {
  it('가입 직후가 아니어도 활성 조건은 signup_completed_at만 본다', () => {
    // Previously there was a 70-day canInviteAfter grace period.
    // That rule is removed: only signup completion matters.
    const code = {
      code: 'NOGRACE1',
      created_by_id: 'creator-1',
      used_by_id: null,
      used_at: null,
    }

    expect(
      canRedeemInviteCode(code, {
        id: 'creator-1',
        signup_completed_at: '2026-01-01T00:00:00Z',
      }).ok
    ).toBe(true)
  })
})
