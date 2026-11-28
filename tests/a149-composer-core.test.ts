import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// A149: every composer surface runs on the one shared core (body/limit, busy, PII second press, submit, image attach).
const SURFACES = [
  'src/components/feed/composer.tsx',
  'src/components/feed/quick-composer.tsx',
  'src/components/anon/anon-composer.tsx',
  'src/components/articles/article-comments.tsx',
]

describe('composer core', () => {
  it.each(SURFACES)('%s uses useComposer + ComposerTextarea and no private submit plumbing', (file) => {
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/useComposer\(/)
    expect(src).toMatch(/<ComposerTextarea/)
    expect(src).not.toMatch(/piiWarning|uploadPickedImage|setBusy|<textarea/)
  })

  it('image attach lives only in the core', () => {
    for (const f of SURFACES) expect(readFileSync(f, 'utf8')).not.toMatch(/type="file"/)
    expect(readFileSync('src/components/composer/use-composer.tsx', 'utf8')).toMatch(/type="file"/)
  })
})
