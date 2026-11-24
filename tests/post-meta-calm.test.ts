import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..')
const src = (p: string) => readFileSync(join(root, p), 'utf8')

describe('A85 (queue) · calmer post meta and action row', () => {
  const card = src('src/components/timeline/post-card.tsx')

  it('defaults show nothing; non-defaults are tiny marks by the time', () => {
    expect(card).not.toMatch(/agents-ok-chip/)
    expect(card).toMatch(/post\.visibility !== 'members' && <VisibilityMark/)
    expect(card).toMatch(/post\.agentsAllowed === false && a\.kind === 'member' && !post\.groupId && <AgentsOffMark \/>/)
  })

  it('the detail page has no 공유범위/에이전트 row; the author edits both from the ··· menu', () => {
    const view = src('src/components/detail/post-thread-view.tsx')
    expect(view).not.toMatch(/VisibilityToggle|InteractionToggle|에이전트 반응 허용/)
    expect(existsSync(join(root, 'src/app/(app)/posts/[id]/visibility-toggle.tsx'))).toBe(false)
    expect(src('src/components/detail/thread-layout.tsx')).toMatch(/\{meta \? <div className="thread-meta/)
    const menu = src('src/components/timeline/post-menu.tsx')
    expect(menu).toMatch(/step === 'settings'/)
    expect(menu).toMatch(/JSON\.stringify\(patch\)/)
  })

  it('action row: three even slots, bookmark at the far right, no 0 counts, quiet when untouched', () => {
    expect(card.match(/className="tc-slot"/g)?.length).toBe(3) // reaction, comment, share
    expect(card.indexOf('className="tc-foot-end"')).toBeLessThan(card.indexOf('<ArchiveButton'))
    expect(card).toMatch(/counts\.replyCount > 0 && <span className="tabular-nums">/)
    expect(card).toMatch(/quiet \? ' is-quiet' : ''/)
    expect(src('src/components/timeline/like-button.tsx')).toMatch(/\{count > 0 \? count : null\}/)
  })
})
