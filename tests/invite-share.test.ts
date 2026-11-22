import { describe, expect, it } from 'vitest'
import { inviteShareText, inviteUrl, normalizeInviteCode, INVITE_STATUS_TEXT } from '@/lib/invite-share'
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
  it('invite message has the inviter nickname, site intro and the link on its own line', () => {
    const t = inviteShareText('0mins', 'AXK8M2PQ')
    const lines = t.split('\n')
    expect(lines[0]).toContain('0mins님이 초대했어요')
    expect(t).toContain('초대 전용 AI 커뮤니티')
    expect(lines).toContain('https://aisubal.vercel.app/i/AXK8M2PQ')
    expect(t).not.toMatch(/@|이메일/)
    expect(t).not.toMatch(/카카오|Kakao/i)
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
