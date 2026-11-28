import { describe, it, expect } from 'vitest'
import { INVITES_PER_MEMBER } from '../src/lib/invite-rules'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43210'

describe('권한 / 멤버 전용 API (DEV_BYPASS_AUTH)', () => {
  it('인증된 멤버는 /api/auth/me에 접근할 수 있다', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.user).toBeTruthy()
    expect(data.user.isAdmin).toBe(true)
    expect(data.waitlist).toBeNull()
  })

  it('멤버는 피드 게시물 목록을 읽을 수 있다', async () => {
    const res = await fetch(`${BASE_URL}/api/posts`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.posts)).toBe(true)
    expect(data.posts.length).toBeGreaterThan(0)
  })

  it('멤버는 아카이브를 읽을 수 있다', async () => {
    const res = await fetch(`${BASE_URL}/api/archive`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.items)).toBe(true)
  })

  it('관리자는 초대 트리에 접근할 수 있다', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/invite-tree`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.tree).toBeTruthy()
    expect(data.tree.displayName).toBeTruthy()
  })

  it('멤버는 초대 코드 3개를 조회할 수 있다', async () => {
    const res = await fetch(`${BASE_URL}/api/invites`)
    expect(res.status).toBe(200)
    const data = await res.json()
    // A31: the current batch holds N (earlier, fully joined batches are listed after it)
    expect(data.codes.filter((c: { batch: number }) => c.batch === data.progress.batch)).toHaveLength(INVITES_PER_MEMBER)
    expect(data.codesActive).toBe(true)
  })
})
