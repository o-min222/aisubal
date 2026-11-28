// @vitest-environment node
/**
 * A149: signed-out requests for a path no page serves get the 404 page (rewrite to /not-found-page),
 * while the login wall (?next=) and share-link previews keep working for real routes.
 */
import fs from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { isKnownRoute } from '@/lib/known-routes'

vi.mock('@/lib/supabase/verified-user', () => ({ verifiedUser: async () => null }))

let middleware: (r: NextRequest) => Promise<Response>
beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon'
  delete process.env.DEV_BYPASS_AUTH
  middleware = (await import('@/middleware')).middleware as never
})

const BROWSER = { 'user-agent': 'Mozilla/5.0 (iPhone) Safari/604.1', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
const run = (path: string, headers: Record<string, string> = BROWSER) => middleware(new NextRequest(new URL(path, 'https://aisubal.vercel.app'), { headers }))
const rewrite = (r: Response) => r.headers.get('x-middleware-rewrite')
const redirect = (r: Response) => r.headers.get('location')

describe('known routes', () => {
  it('generated list is current (run `node scripts/known-routes.mjs --write`)', async () => {
    const { render, OUT } = await import('../scripts/known-routes.mjs')
    expect(fs.readFileSync(OUT, 'utf8')).toBe(render())
  })

  it('matches real pages, dynamic segments and share links; not made-up paths', () => {
    for (const p of ['/', '/feed', '/posts/0b6c1d2e-1111-4222-8333-444455556666', '/anon/abc', '/agora/x', '/articles/a-slug', '/articles/a-slug/edit',
      '/members/m1', '/u/handle', '/i/CODE', '/t/slug', '/settings/profile', '/admin/feedback/1', '/.well-known/oauth-protected-resource/api/mcp', '/feed/'])
      expect(isKnownRoute(p), p).toBe(true)
    for (const p of ['/nope', '/feedx', '/posts/a/b', '/settings/nope', '/wp-login.php', '/admin/feedback/1/2', '/not-a/page'])
      expect(isKnownRoute(p), p).toBe(false)
  })
})

describe('signed-out middleware', () => {
  it('unknown path → rewritten to the 404 page, no sign-in redirect', async () => {
    for (const p of ['/nope-xyz', '/posts/a/b', '/settings/nope?x=1']) {
      const r = await run(p)
      expect(redirect(r), p).toBeNull()
      expect(new URL(rewrite(r)!).pathname, p).toBe('/not-found-page')
    }
  })

  it('login wall unchanged: known members-only pages redirect to / with ?next', async () => {
    const r = await run('/settings/profile')
    expect(r.status).toBe(307)
    const loc = new URL(redirect(r)!)
    expect(loc.pathname).toBe('/')
    expect(loc.searchParams.get('next')).toBe('/settings/profile')
    expect(new URL(redirect(await run('/feed'))!).search).toBe('')
  })

  it('share links unchanged: people are redirected with ?next, preview bots get the teaser rewrite', async () => {
    const post = '/posts/0b6c1d2e-1111-4222-8333-444455556666'
    const r = await run(post)
    expect(new URL(redirect(r)!).searchParams.get('next')).toBe(post)
    const bot = await run(post, { 'user-agent': 'facebookexternalhit/1.1 kakaotalk-scrap/1.0' })
    expect(redirect(bot)).toBeNull()
    expect(new URL(rewrite(bot)!).pathname).toBe('/')
  })

  it('public pages pass through', async () => {
    for (const p of ['/', '/join', '/waitlist', '/articles/some-slug', '/i/CODE', '/not-found-page']) {
      const r = await run(p)
      expect(redirect(r), p).toBeNull()
      expect(rewrite(r), p).toBeNull()
    }
  })
})
