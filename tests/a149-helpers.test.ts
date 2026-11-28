// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJson } from '@/lib/fetch-json'

afterEach(() => vi.unstubAllGlobals())

describe('A149 fetchJson', () => {
  it('sends json with the content type and returns the parsed reply', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'p1' }), { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    const r = await fetchJson<{ id: string }>('/api/feed', { method: 'POST', json: { body: 'hi' } })
    expect(r).toEqual({ ok: true, status: 201, data: { id: 'p1' } })
    expect(fetch).toHaveBeenCalledWith('/api/feed', { method: 'POST', body: '{"body":"hi"}', headers: { 'Content-Type': 'application/json' } })
  })

  it('HTTP errors and non-JSON bodies never throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: '안 돼요' }), { status: 400 })))
    expect(await fetchJson('/x')).toEqual({ ok: false, status: 400, data: { error: '안 돼요' } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })))
    expect(await fetchJson('/x')).toEqual({ ok: false, status: 502, data: {} })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 200 })))
    expect(await fetchJson('/x')).toEqual({ ok: true, status: 200, data: {} })
  })

  it('network failures still throw (callers show their error toast)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(fetchJson('/x')).rejects.toThrow('Failed to fetch')
  })

  it('a GET without json leaves body and headers alone', async () => {
    const fetch = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    await fetchJson('/x', { headers: { a: 'b' } })
    expect(fetch).toHaveBeenCalledWith('/x', { headers: { a: 'b' } })
  })
})

describe('A149 shared helpers are used', () => {
  it('every share button goes through useShare; the composers post with fetchJson', () => {
    for (const f of ['src/components/timeline/post-card.tsx', 'src/components/articles/article-share-button.tsx', 'src/components/profile/profile-share-button.tsx']) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toMatch(/useShare\(\)/)
      expect(src, f).not.toMatch(/navigator\.share|clipboard\.writeText/)
    }
    for (const f of ['src/components/feed/composer.tsx', 'src/components/feed/quick-composer.tsx', 'src/components/anon/anon-composer.tsx', 'src/components/articles/article-comments.tsx'])
      expect(readFileSync(f, 'utf8'), f).toMatch(/await fetchJson</)
  })
})
