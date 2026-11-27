import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { memberNeedsPledge } from '@/lib/pledge-gate'

describe('A109 pledge gate', () => {
  it('treats a missing, null, or empty timestamp as unsigned', () => {
    expect(memberNeedsPledge({ pledge_signed_at: '2026-11-01T12:00:00.000Z' })).toBe(false)
    expect(memberNeedsPledge({ pledge_signed_at: null })).toBe(true)
    expect(memberNeedsPledge({ pledge_signed_at: '' })).toBe(true)
    expect(memberNeedsPledge({})).toBe(true)
  })
  it('app layout does not block the shell on pledge_status or badges_visit', () => {
    const src = readFileSync('src/app/(app)/layout.tsx', 'utf8')
    expect(src).toContain('memberNeedsPledge(member)')
    expect(src).toMatch(/after\(\(\) => \{ void recordVisit\(\)/)
    expect(src).not.toContain('getPledgeStatus')
    expect(src).not.toMatch(/Promise\.all\(\[getPledgeStatus/)
  })
})
