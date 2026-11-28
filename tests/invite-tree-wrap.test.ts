import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('A132 · admin invite tree rows do not wrap Korean nicknames mid-word', () => {
  const src = read('src/app/(app)/admin/invites/invite-tree.tsx')

  it('keeps the nickname and @handle on one unbreakable line', () => {
    expect(src).toMatch(/font-medium whitespace-nowrap shrink-0 break-keep/)
    expect(src).toMatch(/@\{node\.handle\}/)
    expect(src).toMatch(/text-xs text-n-666 whitespace-nowrap shrink-0 break-keep/)
  })

  it('puts real name · email on a second line that shrinks and truncates', () => {
    expect(src).toContain("const privateLine = [node.realName, node.email].filter(Boolean).join(' · ')")
    expect(src).toMatch(/<p className="text-xs text-n-888 min-w-0 truncate"/)
    // private info must not share the identity flex row (that was the wrap bug)
    const identityEnd = src.indexOf('{node.invitedCount > 0 &&')
    const privateStart = src.indexOf('{privateLine ?')
    expect(identityEnd).toBeGreaterThan(0)
    expect(privateStart).toBeGreaterThan(identityEnd)
  })

  it('the mock tree still includes the mid-word wrap cases for local shots', () => {
    const mock = read('src/lib/data/invites.ts')
    expect(mock).toContain("displayName: '제니나이'")
    expect(mock).toContain("displayName: '조이리'")
    expect(mock).toContain("displayName: '새 멤버'")
    expect(mock).toContain("realName: '윤슬'")
  })

  it('the admin member list also keeps nicknames from wrapping mid-word', () => {
    const users = read('src/app/(app)/admin/users/users-admin.tsx')
    expect(users).toMatch(/font-medium text-n-111 whitespace-nowrap break-keep min-w-0 truncate/)
  })
})
