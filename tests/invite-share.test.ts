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
  it('the invite message: who invites you + the code, then the link on its own line', () => {
    const t = inviteShareText('0mins', 'AXK8M2PQ')
    expect(t.split('\n')).toEqual(['0mins님이 AI쓰발에 초대했어요. 초대 코드: AXK8M2PQ', 'https://aisubal.vercel.app/i/AXK8M2PQ'])
    expect(t).not.toMatch(/@|이메일|카카오|Kakao/i)
  })
  it('the English message keeps the shape and links with ?lang=en', () => {
    const lines = inviteShareText('0mins', 'AXK8M2PQ', undefined, makeT('en', DICTS.en), 'en').split('\n')
    expect(lines).toEqual(['0mins invited you to AI쓰발. Invite code: AXK8M2PQ', 'https://aisubal.vercel.app/i/AXK8M2PQ?lang=en'])
  })
  it('the primary button and the share sheet send that same message', () => {
    const src = readFileSync('src/app/(app)/invites/invites-client.tsx', 'utf8')
    expect(src).toMatch(/copy\(msg, `link:/)
    expect(src).toMatch(/navigator\.share\(\{ title: tx\('AI쓰발 초대장'\), text: inviteShareText\(/)
    expect(src).toContain('<T>초대 메시지 복사</T>')
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
