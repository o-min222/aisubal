import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clipLine, isLinkPreviewBot, parseTeaser, sharedPostId, teaserMeta, TEASER_MAX } from '@/lib/share-teaser'

// AI-8 follow-up (Colin, t294u): shared post previews tease eligible posts; crawlers see it at the post URL.
const ID = '1f96a72c-b0ca-4592-b087-dd2c919629de'

describe('link-preview bots', () => {
  it('matches the scrapers, not people in in-app browsers', () => {
    expect(isLinkPreviewBot('facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/scrap/intro.html')).toBe(true)
    expect(isLinkPreviewBot('kakaotalk-scrap/1.0')).toBe(true)
    expect(isLinkPreviewBot('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)')).toBe(true)
    expect(isLinkPreviewBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.9.0')).toBe(false)
    expect(isLinkPreviewBot('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36 Line/14.0.0')).toBe(false)
    expect(isLinkPreviewBot('Mozilla/5.0 (Macintosh) Safari/605.1.15')).toBe(false)
    expect(isLinkPreviewBot(null)).toBe(false)
  })
})

describe('teaser formatting', () => {
  it('only /posts/{uuid} gets a teaser id', () => {
    expect(sharedPostId(`/posts/${ID}`)).toBe(ID)
    expect(sharedPostId(`/posts/${ID.toUpperCase()}?ref=kakao`)).toBe(ID)
    expect(sharedPostId(`/agora/${ID}`)).toBeNull()
    expect(sharedPostId(`/anon/${ID}`)).toBeNull()
    expect(sharedPostId('/posts/post-1')).toBeNull()
  })

  it('clips to one line of ≤ 60 chars and drops a trailing ellipsis', () => {
    expect(clipLine('가'.repeat(80))!.length).toBe(TEASER_MAX - 1)
    expect(clipLine('첫 줄인데 잘렸어요…')).toBe('첫 줄인데 잘렸어요')
    expect(clipLine('a\nb\tc  d')).toBe('a b c d')
    expect(clipLine('짧음')).toBeNull()
    expect(clipLine(42)).toBeNull()
  })

  it('builds og:title / og:description; ineligible stays null', () => {
    expect(parseTeaser(null)).toBeNull()
    expect(parseTeaser({ title: null, body: null })).toBeNull()
    expect(parseTeaser({ title: 'x', body: 'y' })).toBeNull()
    const both = parseTeaser({ title: 'Claude Code로 배포 자동화한 후기', body: '처음엔 반신반의했는데 일주일 써 보니…' })!
    expect(teaserMeta(both, '이어서 보려면 AI쓰발에서')).toEqual({ title: 'Claude Code로 배포 자동화한 후기', description: '처음엔 반신반의했는데 일주일 써 보니… 이어서 보려면 AI쓰발에서' })
    const titleOnly = parseTeaser({ title: '요즘 제일 손에 붙은 프롬프트 패턴', body: null })!
    expect(teaserMeta(titleOnly, 'H')).toEqual({ title: null, description: '요즘 제일 손에 붙은 프롬프트 패턴… H' })
    const long = teaserMeta(parseTeaser({ title: null, body: '나'.repeat(200) })!, 'H').description
    expect(long.length).toBeLessThanOrEqual(TEASER_MAX + 3)
  })
})

describe('0121 keeps the A64 peek safety rules', () => {
  const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '0121_post_share_teaser.sql'), 'utf8')
  it.each([
    "x.visibility = 'members'", 'x.group_id is null', 'x.as_group_id is null', 'x.deleted_at is null', 'not coalesce(x.is_hidden, false)',
    'x.parent_id is null', "x.posted_as = 'real'", 'x.agent_token_id is null', 'x.image_path is null', 'm.public_peek', 'not m.is_banned',
    "key = 'landing_peek'", 'public.peek__has_pii(', 'public.peek__line(', 'security definer', "set search_path to ''",
    'revoke all on function public.post_share_teaser(uuid) from public, anon, authenticated',
  ])('%s', (frag) => expect(sql).toContain(frag))
  it('returns only title and body', () => {
    expect(sql).toMatch(/jsonb_build_object\('title', v_title, 'body', v_body\)/)
    expect(sql).not.toMatch(/author_id'|'image|'url|nickname/)
  })
})
