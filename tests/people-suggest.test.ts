import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

// A76 (Colin, t305u): 알아두면 좋은 사람 never suggests yourself, people you follow, or anyone you have a
// pending (either direction) or accepted friend request with. Mock graph: dev follows member-1/2/4,
// is friends with member-2/5, got a request from member-3 and sent one to member-6.
describe('connectedMemberIds', () => {
  beforeAll(() => {
    process.env.DEV_BYPASS_AUTH = 'true'
  })
  it('covers self, follows, friends and pending requests both ways', async () => {
    const { connectedMemberIds } = await import('@/lib/data/social')
    const s = await connectedMemberIds('dev-user-id')
    for (const id of ['dev-user-id', 'member-1', 'member-2', 'member-3', 'member-4', 'member-5', 'member-6']) expect(s.has(id), id).toBe(true)
    for (const id of ['member-7', 'member-8']) expect(s.has(id), id).toBe(false)
  })
  it('the rail filters real candidates with it on the server', () => {
    const src = readFileSync(join(__dirname, '..', 'src/lib/data/shell.ts'), 'utf8')
    expect(src).toMatch(/const seen = new Set<string>\(\[member\.id, \.\.\.connected,/)
  })
})
