import { describe, expect, it } from 'vitest'
import { LINK_RETURN_PATH, linkErrorMessage, toLoginEmails, type LoginIdentity } from '@/lib/login-identities'
import { safeNextPath } from '@/lib/handoff-rules'

const g = (id: string, email: string | null, createdAt: string): LoginIdentity => ({ id, provider: 'google', email, createdAt })

describe('sign-in emails (A22)', () => {
  it('one email: it is the primary and cannot be removed', () => {
    expect(toLoginEmails([g('a', 'me@gmail.com', '2026-01-01')], 'me@gmail.com')).toEqual([
      expect.objectContaining({ id: 'a', primary: true, removable: false }),
    ])
  })

  it('the account email leads, extra emails follow by date and only they are removable', () => {
    const rows = toLoginEmails(
      [g('w2', 'me@later.co', '2026-03-01'), g('w1', 'me@corp.co', '2026-02-01'), g('p', 'Me@Gmail.com', '2026-01-01')],
      'me@gmail.com',
    )
    expect(rows.map((r) => [r.id, r.primary, r.removable])).toEqual([
      ['p', true, false],
      ['w1', false, true],
      ['w2', false, true],
    ])
  })

  it('no identity matches the account email: the first one is kept as primary, so one sign-in way always remains', () => {
    const rows = toLoginEmails([g('x', null, '2026-01-01'), g('y', 'b@corp.co', '2026-02-01')], 'a@gmail.com')
    expect(rows.filter((r) => r.primary)).toHaveLength(1)
    expect(rows.filter((r) => !r.removable).length).toBeGreaterThanOrEqual(1)
  })

  it('Supabase link errors read as plain words, unknown ones fall back', () => {
    expect(linkErrorMessage('identity_already_exists')).toContain('다른 AI쓰발 계정')
    expect(linkErrorMessage('manual_linking_disabled')).toContain('관리자')
    expect(linkErrorMessage('single_identity_not_deletable')).toContain('마지막 로그인 방법')
    expect(linkErrorMessage('weird')).toBe(linkErrorMessage(undefined))
  })

  it('the return path survives the callback\'s same-origin check', () => {
    expect(safeNextPath(`${LINK_RETURN_PATH}?linked=1`)).toBe(`${LINK_RETURN_PATH}?linked=1`)
  })
})
