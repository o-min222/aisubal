import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { msUntilSessionRefresh, nextKeepaliveDelayMs, shouldRefreshSession, SESSION_REFRESH_MARGIN_MS } from '@/lib/session-keep-alive'

describe('A109 session keepalive', () => {
  const now = Date.parse('2026-11-27T01:00:00.000Z')

  it('refreshes a token already expired or inside the margin, not a fresh one', () => {
    expect(shouldRefreshSession(now / 1000 - 10, now)).toBe(true)
    expect(shouldRefreshSession(now / 1000 + SESSION_REFRESH_MARGIN_MS / 1000 - 1, now)).toBe(true)
    expect(shouldRefreshSession(now / 1000 + 60 * 60, now)).toBe(false)
    expect(shouldRefreshSession(null, now)).toBe(true)
    expect(shouldRefreshSession(undefined, now)).toBe(true)
  })

  it('schedules the next tick at expiry minus the margin, at least 30s', () => {
    expect(msUntilSessionRefresh(now / 1000 + 60 * 60, now)).toBe(60 * 60 * 1000 - SESSION_REFRESH_MARGIN_MS)
    expect(nextKeepaliveDelayMs(now / 1000 + 60 * 60, now)).toBe(60 * 60 * 1000 - SESSION_REFRESH_MARGIN_MS)
    expect(nextKeepaliveDelayMs(now / 1000 + 10, now)).toBe(30_000)
    expect(nextKeepaliveDelayMs(null, now)).toBe(30_000)
  })

  it('does not put tokens in the refresh route response and checks origin', () => {
    const src = readFileSync('src/app/api/auth/refresh/route.ts', 'utf8')
    expect(src).toContain("origin !== request.nextUrl.origin")
    expect(src).toContain('shouldRefreshSession')
    expect(src).toContain('refreshSession')
    expect(src).not.toMatch(/access_token|refresh_token/)
    expect(src).toContain('status: 204')
  })

  it('forwards refreshed middleware cookies on the same request and on redirects', () => {
    const mw = readFileSync('src/middleware.ts', 'utf8')
    expect(mw).toContain('NextResponse.next({ request })')
    expect(mw).not.toMatch(/NextResponse\.next\(\{\s*request:\s*\{\s*headers:\s*request\.headers/)
    expect(mw).toContain('copyResponseCookies(response, NextResponse.redirect')
  })
})

describe('copyResponseCookies', () => {
  it('copies set cookies onto a new response', async () => {
    const { NextResponse } = await import('next/server')
    const { copyResponseCookies } = await import('@/lib/supabase/forward-auth-cookies')
    const from = NextResponse.next()
    from.cookies.set('sb-test', 'value', { path: '/' })
    const to = copyResponseCookies(from, NextResponse.redirect('https://aisubal.vercel.app/'))
    expect(to.cookies.get('sb-test')?.value).toBe('value')
  })
})
