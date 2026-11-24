import { readFileSync } from 'fs'
import path from 'path'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  ANON_MAX_CHARS,
  anonError,
  anonRowToTimeline,
  pickAlias,
  validateAnonInput,
  type AnonRow,
} from '@/lib/anon-rules'
import {
  __resetAnonMock,
  anonLikerCount,
  createAnon,
  getAnonThread,
  likeAnon,
  listAnon,
  reportAnon,
  MOCK_ANON_THRESHOLD,
} from '@/lib/data/anon'

const row: AnonRow = {
  id: '3788ceb9-03a9-4cff-8fc8-40a7d22312e6',
  parentId: null,
  rootId: null,
  category: 'work',
  body: '안녕',
  alias: '익명의 수달',
  isOp: true,
  likeCount: 2,
  replyCount: 1,
  likedByMe: false,
  isMine: false,
  reportedByMe: false,
  isHidden: false,
  isDeleted: false,
  createdAt: '2026-11-22T05:00:00Z',
}

describe('익명 rules', () => {
  it('validates length, category and replies', () => {
    expect(validateAnonInput({ body: '  ', category: 'work' }).ok).toBe(false)
    expect(validateAnonInput({ body: 'x'.repeat(ANON_MAX_CHARS + 1), category: 'work' }).ok).toBe(false)
    expect(validateAnonInput({ body: 'x'.repeat(ANON_MAX_CHARS), category: 'work' }).ok).toBe(true)
    expect(validateAnonInput({ body: 'hi', category: 'nope' }).ok).toBe(false)
    const reply = validateAnonInput({ body: 'hi', parentId: row.id })
    expect(reply.ok && reply.value.category).toBe(null)
  })

  it('aliases: OP is 익명, others 익명1, 익명2 … unique within a thread (A42)', () => {
    const used = new Set<string>([pickAlias([], true)])
    expect([...used]).toEqual(['익명'])
    for (let i = 0; i < 60; i++) used.add(pickAlias(used))
    expect(used.size).toBe(61)
    expect(pickAlias(['익명', '익명1'])).toBe('익명2')
    expect(pickAlias(['익명1', '익명2'], true)).toBe('익명')
  })

  it('timeline mapping never carries a member id', () => {
    const t = anonRowToTimeline(row)
    expect(t.author.kind).toBe('anon')
    expect(t.author.name).toBe('익명의 수달')
    expect(t.author.id).toBe(`${row.id}:익명의 수달`)
    expect(JSON.stringify(t)).not.toMatch(/member|author_id|memberId/i)
    expect(anonRowToTimeline({ ...row, isDeleted: true, body: 'secret' }).body).toBe('')
  })

  it('maps RPC errors to friendly statuses', () => {
    expect(anonError(new Error('anon_daily_limit')).status).toBe(429)
    expect(anonError(new Error('anon_admin_only')).status).toBe(403)
    expect(anonError(new Error('boom')).status).toBe(500)
  })

  it('is not reachable from MCP / CLI (agents can never touch it)', () => {
    for (const f of ['src/app/api/mcp/route.ts', 'src/lib/mcp-data.ts', 'src/lib/mcp/tools.ts', 'src/lib/mcp/dispatch.ts', 'src/lib/mcp/server.ts', 'src/lib/mcp/dev-tools.ts', 'cli/aisubal.ts']) {
      const src = readFileSync(path.resolve(__dirname, '..', f), 'utf8')
      expect(src).not.toMatch(/anon_|\/api\/anon|data\/anon/)
    }
  })
})

describe('익명 store (DEV mock mirrors the RPC rules)', () => {
  beforeEach(() => {
    process.env.DEV_BYPASS_AUTH = 'true'
    __resetAnonMock()
  })

  it('stable alias per author per thread, 글쓴이 flag, unlinkable across threads', async () => {
    const a = await createAnon('m-a', { body: '원글', category: 'chat', parentId: null })
    const r1 = await createAnon('m-b', { body: '답1', category: null, parentId: a.id })
    const r2 = await createAnon('m-b', { body: '답2', category: null, parentId: r1.id })
    const op = await createAnon('m-a', { body: 'OP 답', category: null, parentId: a.id })
    expect(r1.alias).toBe(r2.alias)
    expect(op.alias).toBe(a.alias)
    expect(r1.alias).not.toBe(a.alias)

    const t = (await getAnonThread(a.id, 'm-c'))!
    expect(t.replies.find((r) => r.id === op.id)?.isOp).toBe(true)
    expect(t.replies.find((r) => r.id === r1.id)?.isOp).toBe(false)
    expect(t.root.category).toBe('chat')
    expect(t.replies.every((r) => r.category === 'chat')).toBe(true)
    expect(JSON.stringify(t)).not.toContain('m-a')
    expect(JSON.stringify(t)).not.toContain('m-b')
    expect(t.replies.every((r) => !r.isMine)).toBe(true)
    expect((await getAnonThread(a.id, 'm-b'))!.replies.find((r) => r.id === r1.id)?.isMine).toBe(true)
  })

  it('likers are a count only', async () => {
    const a = await createAnon('m-a', { body: '원글', category: 'ai', parentId: null })
    await likeAnon(a.id, 'm-b', true)
    await likeAnon(a.id, 'm-c', true)
    const r = await anonLikerCount(a.id, 'm-b')
    expect(r).toEqual({ count: 2, likedByMe: true })
    expect(Object.keys(r)).toEqual(['count', 'likedByMe'])
  })

  it('auto-hides after N reports, refuses self-reports', async () => {
    const a = await createAnon('m-a', { body: '문제 글', category: 'worry', parentId: null })
    await expect(reportAnon(a.id, 'm-a', '스팸')).rejects.toThrow('anon_report_own')
    for (let i = 0; i < MOCK_ANON_THRESHOLD - 1; i++) {
      expect((await reportAnon(a.id, `r-${i}`, '스팸')).hidden).toBe(false)
    }
    expect((await reportAnon(a.id, 'r-last', '스팸')).hidden).toBe(true)
    expect((await listAnon('m-x')).some((p) => p.id === a.id)).toBe(false)
    expect(await getAnonThread(a.id, 'm-x')).toBeNull()
  })

  it('filters by category and sorts by popularity', async () => {
    const all = await listAnon('m-x', { sort: 'popular' })
    for (let i = 1; i < all.length; i++) {
      const s = (p: (typeof all)[number]) => p.likeCount * 2 + p.replyCount
      expect(s(all[i - 1])).toBeGreaterThanOrEqual(s(all[i]))
    }
    const work = await listAnon('m-x', { category: 'work' })
    expect(work.length).toBeGreaterThan(0)
    expect(work.every((p) => p.category === 'work')).toBe(true)
  })
})
