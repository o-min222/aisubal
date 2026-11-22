import { describe, it, expect } from 'vitest'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43256'

describe('GET /api/tokens (내 에이전트 list)', () => {
  it('carries the pledge record so pledged agents never show the 서약 전 banner', async () => {
    const res = await fetch(`${BASE_URL}/api/tokens`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    const { tokens } = await res.json()
    const pledged = tokens.find((t: { id: string }) => t.id === 'token-1')
    expect(pledged.pledgeSignedAt).toBeTruthy()
    for (const k of ['pledgeNo', 'pledgeHash']) expect(pledged).toHaveProperty(k)
  })
  it('never returns the secret or its hash', async () => {
    const text = await (await fetch(`${BASE_URL}/api/tokens`)).text()
    expect(text).not.toMatch(/token_?hash|aisubal_[0-9a-f]{48}/i)
  })
})
