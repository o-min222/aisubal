import { describe, expect, it, vi } from 'vitest'

// Resolve test hostnames the way the attack services do (127.0.0.1.nip.io, localtest.me → loopback).
vi.mock('node:dns', async (orig) => {
  const real = await orig<typeof import('node:dns')>()
  const table: Record<string, string> = {
    '127.0.0.1.nip.io': '127.0.0.1',
    'localtest.me': '127.0.0.1',
    'metadata.test': '169.254.169.254',
    'mixed.test': '10.0.0.5',
  }
  const lookup = (host: string, _opts: unknown, cb: (e: Error | null, a: unknown) => void) => {
    const ip = table[host]
    if (!ip) return cb(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }), [])
    cb(null, [{ address: ip, family: 4 }])
  }
  return { ...real, default: { ...real, lookup }, lookup }
})

const { safeFetchText, checkFetchUrl, BlockedUrlError } = await import('@/lib/safe-fetch')
const { fetchLinkPreview, fetchLinkPreviews } = await import('@/lib/link-preview-server')

describe('S-4 SSRF: DNS answers are checked at connect time', () => {
  it.each(['http://127.0.0.1.nip.io/', 'http://localtest.me/', 'http://metadata.test/latest/meta-data/', 'http://mixed.test/'])(
    '%s → blocked_address',
    async (url) => {
      const r = await safeFetchText(url)
      expect(r).toMatchObject({ ok: false, error: 'blocked_address' })
    }
  )

  it('og-preview path throws BlockedUrlError (route → 422), never a cached fallback', async () => {
    await expect(fetchLinkPreview('http://127.0.0.1.nip.io/x')).rejects.toBeInstanceOf(BlockedUrlError)
    await expect(fetchLinkPreview('http://127.0.0.1.nip.io/x')).rejects.toBeInstanceOf(BlockedUrlError)
  })

  it('posting a blocked link still works: host-only card, no fetch', async () => {
    const [p] = await fetchLinkPreviews(['http://localtest.me/admin'])
    expect(p).toMatchObject({ title: 'localtest.me', image: null })
  })

  it('every redirect hop is re-validated: metadata / loopback Location targets are refused', () => {
    for (const loc of ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:43210/', 'http://[::ffff:127.0.0.1]/', 'http://0x7f000001/', 'file:///etc/passwd']) {
      expect(checkFetchUrl(new URL(loc)).ok).toBe(false)
    }
  })
})
