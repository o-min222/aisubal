import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const B = process.env.TEST_BASE_URL || 'http://127.0.0.1:43256'

/** AI-79: "발행 안된 아티클도 지울 수 있으면 좋겠어" */
describe('A146 · authors delete unpublished drafts', () => {
  it('every place that deletes goes through one confirm dialog (reader menu, list rows, editor bar)', () => {
    const dialog = read('src/components/articles/article-delete-dialog.tsx')
    expect(dialog).toContain("fetch(`/api/articles/${articleId}`, { method: 'DELETE' })")
    expect(dialog).toContain('AlertDialogContent')
    expect(dialog).toContain('초고는 완전히 지워지고 되돌릴 수 없어요.')
    for (const f of ['article-owner-menu', 'article-row-menu', 'article-editor']) {
      const src = read(`src/components/articles/${f}.tsx`)
      expect(src, f).toContain('<ArticleDeleteDialog')
      expect(src, f).not.toContain("method: 'DELETE'")
    }
    const mine = read('src/app/(app)/articles/mine/page.tsx')
    expect(mine).toContain('<ArticleRowMenu articleId={a.id}')
    expect(mine).toContain("published={a.status === 'published'}")
  })

  it('the editor never saves a deleted article back (autosave would recreate it) and only offers delete once it exists', () => {
    const ed = read('src/components/articles/article-editor.tsx')
    expect(ed).toContain('const gone = useRef(false)')
    expect(ed).toMatch(/if \(gone\.current \|\| !next\.title\.trim\(\)\) return next/)
    expect(ed).toMatch(/if \(!gone\.current\) void persist\(\)/)
    expect(ed.indexOf('gone.current = true')).toBeLessThan(ed.indexOf("router.replace('/articles/mine')"))
    expect(ed).toMatch(/\{draft\.id && \(\s*<button type="button" className="article-editor-delete/)
  })

  it('db: article_delete removes a draft for the author (and admin), hides a published one; MCP article_delete does the same for the agent’s own drafts', () => {
    const human = read('supabase/migrations/0135_articles.sql').split('function public.article_delete(')[1].split('$$;')[0]
    expect(human).toMatch(/a\.author_id <> v_me and not public\.app__is_admin\(\)/)
    expect(human).toMatch(/if a\.status = 'published' or \(a\.status = 'hidden' and a\.comment_count > 0\) then/)
    expect(human).toMatch(/delete from public\.articles where id = a\.id/)
    const mcp = read('supabase/migrations/0152_mcp_article_write.sql').split('function public.mcp_article_delete(')[1].split('$$;')[0]
    expect(mcp).toMatch(/a\.agent_token_id is distinct from t\.id/)
    expect(mcp).toMatch(/delete from public\.articles where id = a\.id/)
    const latest = readdirSync(join(__dirname, '..', 'supabase/migrations')).filter((f) => /^\d+_/.test(f)).sort()
    const redefs = latest.filter((f) => /function public\.(mcp_)?article_delete\(/.test(read(`supabase/migrations/${f}`)))
    expect(redefs).toEqual(['0135_articles.sql', '0152_mcp_article_write.sql'])
  })

  it('dev server: create a draft, delete it, it is gone; a second delete is a 404', async () => {
    const created = await fetch(`${B}/api/articles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'A146 draft to delete', body: 'x' }) })
    expect(created.status).toBe(200)
    const { article } = await created.json()
    expect(article.status).toBe('draft')
    const del = await fetch(`${B}/api/articles/${article.id}`, { method: 'DELETE' })
    expect(await del.json()).toEqual({ id: article.id, deleted: true })
    expect((await fetch(`${B}/api/articles/${article.id}`, { method: 'DELETE' })).status).toBe(404)
  })
})
