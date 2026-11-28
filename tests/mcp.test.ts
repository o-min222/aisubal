import { describe, it, expect } from 'vitest'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43210'

describe('API 토큰 / MCP 준비', () => {
  it('멤버는 API 토큰을 생성할 수 있다', async () => {
    const res = await fetch(`${BASE_URL}/api/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'MCP 테스트',
        scopes: ['archive_read', 'posts_read'],
      }),
    })

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.token.token).toMatch(/^aisubal_/)
    expect(data.token.scopes).toContain('archive_read')
  })

  it('멤버는 토큰 목록을 조회할 수 있다', async () => {
    const res = await fetch(`${BASE_URL}/api/tokens`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.tokens)).toBe(true)
  })
})
