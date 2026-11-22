import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A12: numbered pagination is gone from every list page (agora/anon joined in A15/A17).
const ROOT = join(__dirname, '..', 'src', 'app')

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return pages(p)
    return name === 'page.tsx' ? [p] : []
  })
}

describe('infinite scroll everywhere', () => {
  const files = pages(ROOT)

  it('the Pagination component is gone', () => {
    expect(existsSync(join(__dirname, '..', 'src', 'components', 'pagination.tsx'))).toBe(false)
  })

  it('no list page renders <Pagination>', () => {
    const offenders = files.filter((f) => /<Pagination\b/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('no "n/m 페이지" footer remains', () => {
    const offenders = files.filter((f) => /\}\s*\/\s*\{[^}]*\}\s*페이지/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('the converted list pages use InfiniteList', () => {
    for (const rel of ['feed', 'gallery', 'moim', 'archive', 'groups', 'groups/[slug]', 'members/[id]', 'me', 'gallery/submissions', 'admin/tool-reviews', 'agora', 'anon']) {
      const src = readFileSync(join(ROOT, '(app)', rel, 'page.tsx'), 'utf8')
      expect(src, rel).toMatch(/<InfiniteList\b|<FeedBoard\b/)
    }
  })
})
