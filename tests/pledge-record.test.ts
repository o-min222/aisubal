import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PLEDGE_KO } from '@/lib/pledge'
import { pledgeDigest, recordNo, shortHash } from '@/lib/pledge-record'

describe('pledge record digest', () => {
  // values computed by public.pledge__digest in Postgres (migrations 0020 + 0021)
  it('matches the database byte for byte', async () => {
    expect(await pledgeDigest({ kind: 'member', signer: '테스트', inviter: '초대자', prevHash: null, signedAt: '2026-11-22T10:24:00.123Z' })).toBe(
      'd0a4b9e94701d35bd621027ab504e1f0978ce197a18d29d5d826d650e1ab321a',
    )
    // 2027-12-31 15:30 UTC is already 2028 in KST: the dateline year follows KST
    expect(await pledgeDigest({ kind: 'member', signer: '테스트', inviter: '초대자', prevHash: null, signedAt: '2027-12-31T15:30:00.000Z' })).toBe(
      '067a1bc61265e990d9966d4ff557ebcca5231c844142a6f0eb5c18796f300678',
    )
  })

  it('the SQL canonical text is the authored Korean pledge', () => {
    const sql = readFileSync('supabase/migrations/0020_pledge_records.sql', 'utf8')
    const seeded = sql.split('$pledge$')[1].replace('\n2026년, 새로운 시대의 경계 위에서', '\n{year}년, 새로운 시대의 경계 위에서')
    const t = PLEDGE_KO
    expect(seeded).toBe([t.title, ...t.preamble, ...t.vows, t.closing, t.dateline].join('\n'))
  })

  it('changes with any field', async () => {
    const base = { kind: 'member' as const, signer: 'a', inviter: null, prevHash: null, signedAt: '2026-11-22T10:24:00.123Z' }
    const h = await pledgeDigest(base)
    expect(await pledgeDigest({ ...base, signer: 'b' })).not.toBe(h)
    expect(await pledgeDigest({ ...base, prevHash: 'ab'.repeat(32) })).not.toBe(h)
    expect(await pledgeDigest({ ...base, kind: 'agent' })).not.toBe(h)
  })

  it('formats', () => {
    expect(recordNo(7)).toBe('#0007')
    expect(shortHash('0123456789abcdef'.repeat(4))).toBe('01234567…cdef')
  })
})
