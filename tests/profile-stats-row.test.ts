import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('A92 · side-panel profile card stats', () => {
  it('stat cells are numbers only; the 초대 네트워크 link is one row under them', () => {
    const s = read('src/components/profile/member-card.tsx')
    expect(s).not.toContain('profile-stat-sub')
    expect(s).toContain('className="profile-stats-foot"')
    expect(s).toMatch(/flatMap\(\(st\) => \(st\.sub \? \[st\.sub\] : \[\]\)\)/)
  })

  it('no wrapping: the link row and the stat labels stay on one line', () => {
    const css = read('src/app/globals.css')
    expect(css).not.toContain('.profile-stat-sub {')
    expect(css).toMatch(/\.profile-stats-link \{[^}]*white-space: nowrap/)
    expect(css).toMatch(/\.profile-stats dt \{[^}]*white-space: nowrap/)
    expect(read('src/i18n/dict/en.ts')).toContain('"받은 좋아요": "Likes",')
  })
})
