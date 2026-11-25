import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  clipLine, isLinkPreviewBot, isSharePreviewFetch, parseTeaser, shareCanonicalUrl,
  shareMeta, sharePreviewKind, sharedPostId, teaserMeta, TEASER_MAX, SHARE_OG_TITLE,
} from '@/lib/share-teaser'

const ID = '1f96a72c-b0ca-4592-b087-dd2c919629de'

describe('link-preview bots', () => {
  it('matches the scrapers, not people in in-app browsers', () => {
    expect(isLinkPreviewBot('facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/scrap/intro.html')).toBe(true)
    expect(isLinkPreviewBot('kakaotalk-scrap/1.0')).toBe(true)
    expect(isLinkPreviewBot('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)')).toBe(true)
    expect(isLinkPreviewBot('facebookexternalhit/1.1; Facebot; Twitterbot/1.0')).toBe(true)
    expect(isLinkPreviewBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)')).toBe(true)
    expect(isLinkPreviewBot('Mozilla/5.0 (compatible; MicrosoftPreview/2.0; +https://aka.ms/MicrosoftPreview)')).toBe(true)
    expect(isLinkPreviewBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.9.0')).toBe(false)
    expect(isLinkPreviewBot('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36 Line/14.0.0')).toBe(false)
    expect(isLinkPreviewBot('Mozilla/5.0 (Macintosh) Safari/605.1.15')).toBe(false)
    expect(isLinkPreviewBot(null)).toBe(false)
  })

  it('rewrites curl/empty-UA crawlers, not a person navigating', () => {
    expect(isSharePreviewFetch({ ua: 'curl/8.7.1' })).toBe(true)
    expect(isSharePreviewFetch({ ua: '' })).toBe(true)
    expect(isSharePreviewFetch({ ua: 'Applebot/0.1' })).toBe(true)
    expect(isSharePreviewFetch({
      ua: 'Mozilla/5.0 (Macintosh) Safari/605.1.15',
      secFetchMode: 'navigate',
      secFetchDest: 'document',
    })).toBe(false)
    expect(isSharePreviewFetch({ ua: 'Mozilla/5.0 (Macintosh) Safari/605.1.15' })).toBe(false)
  })
})

describe('share preview paths', () => {
  it('classifies shareable content and skips composers / settings', () => {
    expect(sharePreviewKind(`/posts/${ID}`)).toBe('post')
    expect(sharePreviewKind(`/agora/${ID}`)).toBe('agora')
    expect(sharePreviewKind(`/anon/${ID}`)).toBe('anon')
    expect(sharePreviewKind(`/members/${ID}`)).toBe('profile')
    expect(sharePreviewKind('/u/cloud')).toBe('profile')
    expect(sharePreviewKind('/gallery/my-tool')).toBe('gallery')
    expect(sharePreviewKind('/posts/new')).toBeNull()
    expect(sharePreviewKind('/members/me')).toBeNull()
    expect(sharePreviewKind('/gallery/new')).toBeNull()
    expect(sharePreviewKind('/gallery/submissions')).toBeNull()
    expect(sharePreviewKind('/settings')).toBeNull()
    expect(sharedPostId(`/posts/${ID}`)).toBe(ID)
    expect(sharedPostId(`/posts/${ID.toUpperCase()}?ref=kakao`)).toBe(ID)
    expect(sharedPostId(`/agora/${ID}`)).toBeNull()
  })

  it('builds an absolute og:url without query or hash', () => {
    expect(shareCanonicalUrl(`/posts/${ID}?ref=kakao#c`)).toBe(`https://aisubal.vercel.app/posts/${ID}`)
    expect(shareMeta({ title: 'T', description: 'D', url: 'https://aisubal.vercel.app/posts/x' }).openGraph).toMatchObject({
      url: 'https://aisubal.vercel.app/posts/x',
      siteName: 'AI쓰발',
    })
    expect(shareMeta({ title: 'T', description: 'D', url: 'https://aisubal.vercel.app/posts/x' }).openGraph?.images).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'image/png' })]),
    )
  })
})

describe('teaser formatting', () => {
  it('only /posts/{uuid} gets a teaser id', () => {
    expect(sharedPostId(`/posts/${ID}`)).toBe(ID)
    expect(sharedPostId('/posts/post-1')).toBeNull()
  })

  it('clips to one line of ≤ 100 chars and drops a trailing ellipsis', () => {
    expect(clipLine('가'.repeat(180))!.length).toBe(TEASER_MAX - 1)
    expect(clipLine('첫 줄인데 잘렸어요…')).toBe('첫 줄인데 잘렸어요')
    expect(clipLine('a\nb\tc  d')).toBe('a b c d')
    expect(clipLine('짧음')).toBeNull()
    expect(clipLine(42)).toBeNull()
  })

  it('builds og:title as the service name and a teaser description; drops any author name', () => {
    expect(parseTeaser(null)).toBeNull()
    expect(parseTeaser({ title: null, body: null, name: '구름' })).toBeNull()
    expect(parseTeaser({ title: 'x', body: 'y' })).toBeNull()
    const both = parseTeaser({ title: 'Claude Code로 배포 자동화한 후기', body: '처음엔 반신반의했는데 일주일 써 보니…', name: '구름' })!
    expect(both).not.toHaveProperty('name')
    expect(teaserMeta(both, '이어서 보려면 AI쓰발에서')).toEqual({
      title: SHARE_OG_TITLE,
      description: '처음엔 반신반의했는데 일주일 써 보니… 이어서 보려면 AI쓰발에서',
    })
    expect(teaserMeta(both, '이어서 보려면 AI쓰발에서').title).toBe('AI쓰발')
    expect(JSON.stringify(teaserMeta(both, 'H'))).not.toMatch(/구름/)
    const titleOnly = parseTeaser({ title: '요즘 제일 손에 붙은 프롬프트 패턴', body: null, name: '구름' })!
    expect(teaserMeta(titleOnly, 'H')).toEqual({ title: 'AI쓰발', description: '요즘 제일 손에 붙은 프롬프트 패턴… H' })
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

describe('0131 preview: author name, 100 chars, images allowed, no leak', () => {
  const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '0131_post_share_preview.sql'), 'utf8')
  it.each([
    "x.visibility = 'members'", 'x.group_id is null', 'x.as_group_id is null', 'x.deleted_at is null', 'not coalesce(x.is_hidden, false)',
    'x.parent_id is null', "x.posted_as = 'real'", 'x.agent_token_id is null', 'm.public_peek', 'not m.is_banned',
    "key = 'landing_peek'", 'public.peek__has_pii(', 'public.peek__share_line(', 'security definer', "set search_path to ''",
    'm.display_name', 'revoke all on function public.post_share_preview(uuid) from public, anon, authenticated',
    'grant execute on function public.post_share_preview(uuid) to anon, authenticated',
  ])('%s', (frag) => expect(sql).toContain(frag))
  it('does not reject posts that have an image, and never selects the photo', () => {
    expect(sql).not.toMatch(/x\.image_path is null/)
    expect(sql).not.toMatch(/image_path,|p\.image_path/)
  })
  it('returns title, body and name only', () => {
    expect(sql).toMatch(/jsonb_build_object\('title', v_title, 'body', v_body, 'name', v_name\)/)
    expect(sql).not.toMatch(/author_id'|'image_path|'url|nickname/)
  })
})

describe('0132 preview: no author name, own kill switch', () => {
  const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '0132_share_preview_no_name.sql'), 'utf8')
  it.each([
    "x.visibility = 'members'", 'x.group_id is null', 'x.as_group_id is null', 'x.deleted_at is null', 'not coalesce(x.is_hidden, false)',
    'x.parent_id is null', "x.posted_as = 'real'", 'x.agent_token_id is null', 'm.public_peek', 'not m.is_banned',
    "key = 'share_preview'", 'public.peek__has_pii(', 'public.peek__share_line(', 'security definer', "set search_path to ''",
    'revoke all on function public.post_share_preview(uuid) from public, anon, authenticated',
    'grant execute on function public.post_share_preview(uuid) to anon, authenticated',
  ])('%s', (frag) => expect(sql).toContain(frag))
  it('does not return or select an author name, and uses its own kill switch', () => {
    expect(sql).toMatch(/jsonb_build_object\('title', v_title, 'body', v_body\)/)
    expect(sql).not.toMatch(/v_name|display_name|'name'/)
    expect(sql).not.toMatch(/key = 'landing_peek'/)
    expect(sql).toMatch(/key = 'share_preview'/)
  })
})
