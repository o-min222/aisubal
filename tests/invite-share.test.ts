import { describe, expect, it } from 'vitest'
import { inviteShareText, inviteUrl, normalizeInviteCode, INVITE_STATUS_TEXT } from '@/lib/invite-share'
import { makeT } from '@/i18n/translate'
import { DICTS } from '@/i18n/dict'
import { readFileSync } from 'node:fs'

describe('invite share', () => {
  it('normalizes codes and rejects anything else', () => {
    expect(normalizeInviteCode(' axk8m2pq ')).toBe('AXK8M2PQ')
    expect(normalizeInviteCode('AXK8M2P')).toBeNull()
    expect(normalizeInviteCode('AXK8-M2P')).toBeNull()
    expect(normalizeInviteCode(42)).toBeNull()
  })
  it('builds the /i/{code} link on the production origin by default', () => {
    expect(inviteUrl('AXK8M2PQ')).toBe('https://aisubal.vercel.app/i/AXK8M2PQ')
    expect(inviteUrl('AXK8M2PQ', 'http://localhost:3000/')).toBe('http://localhost:3000/i/AXK8M2PQ')
  })
  it('invite text is two lines: who invited you, then the link (no separate code line)', () => {
    const t = inviteShareText('0mins', 'AXK8M2PQ')
    expect(t.split('\n')).toEqual([
      '0mins님이 당신을 AI쓰발에 초대했습니다. 초대받은 자만 들어올 수 있습니다.',
      'https://aisubal.vercel.app/i/AXK8M2PQ',
    ])
    expect(t).not.toMatch(/@|이메일/)
    expect(t).not.toMatch(/카카오|Kakao/i)
  })
  it('the English invite has the same two lines', () => {
    const en = inviteShareText('0mins', 'AXK8M2PQ', undefined, makeT('en', DICTS.en), 'en')
    expect(en.split('\n')).toEqual(['0mins has invited you to AI쓰발. Only the invited may enter.', 'https://aisubal.vercel.app/i/AXK8M2PQ?lang=en'])
  })
  it('every status has a clear message', () => {
    for (const s of ['valid', 'used', 'inactive', 'invalid'] as const) expect(INVITE_STATUS_TEXT[s].length).toBeGreaterThan(5)
  })
  it('invites page no longer ships hard-coded mock codes', () => {
    const src = readFileSync('src/app/(app)/invites/invites-client.tsx', 'utf8')
    expect(src).not.toMatch(/MOCK_CODES|AXK8M2PQ/)
  })
  it('the invite cookie is httpOnly and cleared after redeem', () => {
    expect(readFileSync('src/app/api/invites/claim/route.ts', 'utf8')).toMatch(/httpOnly: true/)
    expect(readFileSync('src/app/api/auth/redeem-invite/route.ts', 'utf8')).toMatch(/cookies\.delete\(INVITE_COOKIE\)/)
    expect(readFileSync('src/middleware.ts', 'utf8')).toMatch(/'\/i'/)
  })
})
