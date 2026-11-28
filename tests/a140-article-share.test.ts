import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { articleGateTeaser, ARTICLE_TEASER_MAX } from '@/lib/article-rules'
import { withArticleShareUrl } from '@/lib/mcp-data'
import { TOOL_SPECS } from '@/lib/mcp/tools'
import { skillMarkdown } from '@/lib/skill-md'
import { MCP_CONFIG_VERSION } from '@/lib/mcp/config-version'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('A140 · what a non-member can read of a shared article', () => {
  const paras = Array.from({ length: 10 }, (_, i) => `${i + 1}번째 문단입니다. ` + '가'.repeat(120)).join('\n\n')
  it('is at most 60% of the body and at most the 800 character cap', () => {
    const t = articleGateTeaser(paras)
    expect(t.length).toBeGreaterThan(0)
    expect(t.length).toBeLessThanOrEqual(Math.floor(paras.length * 0.6))
    expect(t.length).toBeLessThanOrEqual(ARTICLE_TEASER_MAX)
    expect(t).not.toContain('10번째 문단')
    expect(articleGateTeaser('가'.repeat(5000)).length).toBeLessThanOrEqual(ARTICLE_TEASER_MAX)
  })
  it('a short article is never shown in full', () => {
    const short = '첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다.'
    const t = articleGateTeaser(short)
    expect(t.length).toBeLessThan(short.length)
    expect(t).not.toContain('셋째')
    expect(articleGateTeaser('')).toBe('')
    expect(articleGateTeaser(null)).toBe('')
  })
  it('0156 caps the public teaser in the database too, with no new client grants', () => {
    const sql = read('supabase/migrations/0156_article_gate_teaser.sql')
    expect(sql).toContain('least(800, floor(char_length(btrim(coalesce(p_body')
    expect(sql).toContain('* 0.6')
    expect(sql).toContain('revoke all on function public.article__gate_teaser(text) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.article_public_teaser(text) to anon, authenticated')
    expect(sql).toContain('article__gate_teaser(a.body)')
    expect(sql).not.toMatch(/grant execute on function public\.article__gate_teaser/)
  })
  it('the read page only ever loads the teaser for signed-out visitors and links the real invite request', () => {
    const page = read('src/app/articles/[slug]/page.tsx')
    expect(page).toContain('getArticle(slug, { teaser: !signedIn })')
    expect(page).toContain('href="/join?from=article"')
    expect(page).toContain('ArticleShareButton')
    expect(page).toMatch(/\{!article\.truncated && <ArticleComments/)
  })
})

describe('A140 · agents get a shareUrl', () => {
  it('published articles get an absolute share link; drafts do not', () => {
    const origin = 'https://aisubal.test'
    expect((withArticleShareUrl({ slug: 'my-post', status: 'published' } as Record<string, unknown>, origin)).shareUrl).toBe('https://aisubal.test/articles/my-post')
    expect(withArticleShareUrl({ slug: 'my-post', status: 'draft' }, origin)).not.toHaveProperty('shareUrl')
    const list = withArticleShareUrl({ articles: [{ slug: 'a', status: 'published' }, { slug: 'b', status: 'hidden' }] }, origin) as { articles: Array<Record<string, unknown>> }
    expect(list.articles[0]!.shareUrl).toBe('https://aisubal.test/articles/a')
    expect(list.articles[1]).not.toHaveProperty('shareUrl')
  })
  it('tool descriptions, skill.md and the config version', () => {
    for (const n of ['article_list', 'article_get', 'article_search', 'article_create', 'article_edit']) {
      expect(TOOL_SPECS.find((t) => t.name === n)!.description).toContain('shareUrl')
    }
    expect(skillMarkdown('https://x.test')).toContain('shareUrl')
    expect(MCP_CONFIG_VERSION).toBe('2026-11-28.2')
  })
})
