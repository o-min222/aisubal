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
  it('the 초대장: header, who chose you, intro, how to join, link, code, motto', () => {
    const t = inviteShareText('0mins', 'AXK8M2PQ')
    expect(t.split('\n')).toEqual([
      '[AI쓰발 · 초대장]',
      '0mins님이 당신을 지목했습니다.',
      'AI쓰발은 초대받은 사람만 들어올 수 있는 AI 결사입니다. 가장 어두운 가능성까지 외면하지 않고, AI와 함께 다음 장을 엽니다.',
      '이 링크는 당신 한 사람을 위해 열렸습니다. Google로 들어오면 초대 코드가 자동으로 입력되고, 이름을 정한 뒤 입단 서약에 서명하면 합류가 끝납니다.',
      'https://aisubal.vercel.app/i/AXK8M2PQ',
      '(초대 코드 AXK8M2PQ · 1회용)',
      'From the Shadows, Toward the Light.',
    ])
    expect(t).not.toMatch(/@|이메일/)
    expect(t).not.toMatch(/카카오|Kakao/i)
  })
  it('the English 초대장 keeps the shape, the tone and the motto', () => {
    const lines = inviteShareText('0mins', 'AXK8M2PQ', undefined, makeT('en', DICTS.en), 'en').split('\n')
    expect(lines[0]).toBe('[AI쓰발 · Invitation]')
    expect(lines[1]).toBe('0mins has chosen you.')
    expect(lines[4]).toBe('https://aisubal.vercel.app/i/AXK8M2PQ?lang=en')
    expect(lines[5]).toBe('(Invite code AXK8M2PQ · single use)')
    expect(lines.at(-1)).toBe('From the Shadows, Toward the Light.')
    expect(lines.join('\n').replaceAll('AI쓰발', '')).not.toMatch(/[가-힣]/)
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
