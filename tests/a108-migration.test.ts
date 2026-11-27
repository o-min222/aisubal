import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/0135_articles.sql', 'utf8')

describe('0135_articles migration', () => {
  it('is RPC-only: tables have RLS and revoke anon/authenticated defaults', () => {
    for (const t of ['article_series', 'articles', 'article_slug_redirects', 'article_series_subs', 'article_likes', 'article_comments']) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`))
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${t} from public, anon, authenticated`))
    }
  })

  it('exposes a SECURITY DEFINER public teaser that never selects the full body as body', () => {
    expect(sql).toMatch(/create or replace function public\.article_public_teaser\(/)
    expect(sql).toMatch(/security definer/)
    expect(sql).toMatch(/grant execute on function public\.article_public_teaser\(text\) to anon, authenticated/)
    expect(sql).toMatch(/teaser := public\.article__teaser_body\(a\.body, 800\)/)
    expect(sql).toMatch(/public\.article__card\(a, teaser\)/)
    // must not pass a.body as the card body in the public teaser function
    const fn = sql.slice(sql.indexOf('function public.article_public_teaser'), sql.indexOf('function public.article_share_preview'))
    expect(fn).toContain("article__card(a, teaser)")
    expect(fn).not.toMatch(/article__card\(a, a\.body\)/)
  })

  it('keeps share preview and image checks callable by anon, with no table grants', () => {
    expect(sql).toMatch(/grant execute on function public\.article_share_preview\(text\) to anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.article_image_ok\(text\) to anon, authenticated/)
    expect(sql).not.toMatch(/grant (select|insert|update|delete|all) on public\.articles to anon/)
  })

  it('adds the writer flag, admin toggle, kill switches, and articles notification category', () => {
    expect(sql).toMatch(/add column if not exists article_writer boolean not null default false/)
    expect(sql).toMatch(/admin_set_article_writer/)
    expect(sql).toMatch(/article_publishing/)
    expect(sql).toMatch(/article_public_teaser/)
    expect(sql).toMatch(/article_share_preview/)
    expect(sql).toMatch(/'article_published'/)
    expect(sql).toMatch(/'articles'/)
    expect(sql).toMatch(/notification_prefs add column if not exists articles boolean not null default true/)
  })

  it('creates a private article-images bucket and member-only write policies', () => {
    expect(sql).toMatch(/values \('article-images', 'article-images', false, 4194304/)
    expect(sql).toMatch(/article_images_insert_own/)
    expect(sql).toMatch(/article_images_select/)
  })

  it('extends archive kinds and get_my_member with publish permission', () => {
    expect(sql).toMatch(/'article'/)
    expect(sql).toMatch(/article_can_publish/)
    expect(sql).toMatch(/archive_entries_kind_check/)
  })
})
