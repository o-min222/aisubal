import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { TOKEN_SCOPES } from '@/lib/supabase/types'
import { MEMBER_SCOPES, connectScopes } from '@/lib/agent-connect'
import robots from '@/app/robots'

const src = (p: string) => readFileSync(p, 'utf8')

describe('A148 behavior-preserving cleanups', () => {
  it('/api/tokens validates against the one scope list, which covers every member and admin scope', () => {
    for (const s of connectScopes(true, true)) expect(TOKEN_SCOPES).toContain(s)
    expect(TOKEN_SCOPES).toContain('article:write')
    for (const s of MEMBER_SCOPES) expect(TOKEN_SCOPES).toContain(s)
    expect(src('src/app/api/tokens/route.ts')).toMatch(/z\.enum\(TOKEN_SCOPES\)/)
  })

  it('member article images try the agent blob before signing a storage object', () => {
    const s = src('src/lib/data/article-images.ts')
    const member = s.slice(s.indexOf("const supabase = await sb()\n  const { data: ok"))
    expect(member.indexOf('blobImage(path, false)')).toBeLessThan(member.indexOf('createSignedUrl'))
  })

  it('robots.txt exists, keeps share cards crawlable and fences sign-in flows', () => {
    const r = robots()
    const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules
    expect(rules.disallow).toEqual(expect.arrayContaining(['/api/', '/oauth/', '/auth/']))
    for (const p of ['/t/', '/h', '/i/', '/og/']) expect(rules.disallow).not.toContain(p)
  })

  it('PostgREST or() filters re-clean the search term at the sink', () => {
    expect(src('src/lib/data/feed.ts')).toMatch(/const term = opts\.q \? cleanQuery\(opts\.q\) : null/)
    expect(src('src/lib/data/search.ts')).toMatch(/const term = cleanQuery\(q\) \?\? ''/)
  })

  it('fetch error fallbacks are translated, not hard-coded Korean', () => {
    for (const f of ['src/components/social/follow-button.tsx', 'src/components/feed/composer.tsx', 'src/components/profile/profile-card-editor.tsx']) {
      expect(src(f)).not.toMatch(/\.error \|\| '[^']*[가-힣]/)
    }
  })

  it('knip-dead UI files are gone; the kept logo still has its cn helper', () => {
    for (const f of ['src/components/ui/card.tsx', 'src/components/ui/command.tsx', 'src/components/reading/post-row.tsx', 'src/lib/row-text.ts']) expect(existsSync(f)).toBe(false)
    expect(existsSync('src/components/logo.tsx')).toBe(true)
    expect(existsSync('src/lib/utils.ts')).toBe(true)
  })
})
