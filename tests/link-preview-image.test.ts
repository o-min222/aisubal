import { readFileSync } from 'node:fs'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import sharp from 'sharp'
import { previewImageAlt, previewImageSrc, previewDisplaySrc, isFragilePreviewImage, sniffPreviewImage, PREVIEW_IMAGE_PATH } from '@/lib/preview-image'

describe('previewImageSrc', () => {
  it('builds a same-origin proxy URL from the page address (not the CDN image)', () => {
    const page = 'https://www.instagram.com/p/ABC123/'
    expect(previewImageSrc(page)).toBe(`${PREVIEW_IMAGE_PATH}?url=${encodeURIComponent(page)}`)
  })
  it('rejects empty, oversized, or non-http URLs and does not double-wrap', () => {
    expect(previewImageSrc('')).toBeNull()
    expect(previewImageSrc('javascript:alert(1)')).toBeNull()
    expect(previewImageSrc('ftp://example.com/x')).toBeNull()
    expect(previewImageSrc('https://a.com/' + 'x'.repeat(2000))).toBeNull()
    const already = `${PREVIEW_IMAGE_PATH}?url=https%3A%2F%2Fa.com%2F`
    expect(previewImageSrc(already)).toBe(already)
  })
})


describe('previewDisplaySrc', () => {
  it('proxies Instagram / fbcdn URLs through the page address, and leaves stable hosts alone', () => {
    const page = 'https://www.instagram.com/p/ABC123/'
    const ig = 'https://scontent-nrt6-1.cdninstagram.com/v/t51.82787-15/x.jpg?oe=6B0C875E'
    expect(isFragilePreviewImage(ig)).toBe(true)
    expect(previewDisplaySrc(page, ig)).toBe(`${PREVIEW_IMAGE_PATH}?url=${encodeURIComponent(page)}`)
    expect(isFragilePreviewImage('https://opengraph.githubassets.com/1/vercel/next.js')).toBe(false)
    expect(previewDisplaySrc('https://github.com/vercel/next.js', 'https://opengraph.githubassets.com/1/vercel/next.js')).toBe('https://opengraph.githubassets.com/1/vercel/next.js')
    expect(previewDisplaySrc('https://youtu.be/x', 'https://img.youtube.com/vi/x/hqdefault.jpg')).toBe('https://img.youtube.com/vi/x/hqdefault.jpg')
    expect(previewDisplaySrc(page, null)).toBeNull()
    expect(previewDisplaySrc(page, 'http://insecure.example/i.jpg')).toBeNull()
  })
})

describe('previewImageAlt', () => {
  it('never returns an empty string', () => {
    expect(previewImageAlt('Title', 'Instagram', 'https://instagram.com/p/x')).toBe('Title')
    expect(previewImageAlt('  ', 'Instagram', 'https://www.instagram.com/p/x')).toBe('Instagram')
    expect(previewImageAlt(null, null, 'https://www.instagram.com/p/x')).toBe('instagram.com')
    expect(previewImageAlt('', '', 'not-a-url')).toBe('link')
  })
})

describe('sniffPreviewImage', () => {
  it('recognises png, jpeg, webp, gif, avif and heic from magic bytes', async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#112233' } }).png().toBuffer()
    const jpeg = await sharp(png).jpeg().toBuffer()
    const webp = await sharp(png).webp().toBuffer()
    const gif = Buffer.from('GIF89a' + '\x01\x00\x01\x00\x00\x00\x00')
    expect(sniffPreviewImage(png)).toBe('image/png')
    expect(sniffPreviewImage(jpeg)).toBe('image/jpeg')
    expect(sniffPreviewImage(webp)).toBe('image/webp')
    expect(sniffPreviewImage(gif)).toBe('image/gif')
    const avif = Buffer.alloc(16)
    avif[4] = 0x66; avif[5] = 0x74; avif[6] = 0x79; avif[7] = 0x70
    avif[8] = 0x61; avif[9] = 0x76; avif[10] = 0x69; avif[11] = 0x66
    expect(sniffPreviewImage(avif)).toBe('image/avif')
    const heic = Buffer.alloc(16)
    heic[4] = 0x66; heic[5] = 0x74; heic[6] = 0x79; heic[7] = 0x70
    heic[8] = 0x68; heic[9] = 0x65; heic[10] = 0x69; heic[11] = 0x63
    expect(sniffPreviewImage(heic)).toBe('image/heic')
    expect(sniffPreviewImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(sniffPreviewImage(Buffer.from('not an image'))).toBeNull()
  })
})

describe('preview image UI contracts', () => {
  it('the sheet and card hide a failed OG image, never point the browser at the raw CDN URL, and never use an empty alt', () => {
    const sheet = readFileSync('src/components/link-preview-block.tsx', 'utf8')
    const card = readFileSync('src/components/link-card.tsx', 'utf8')
    const safe = readFileSync('src/components/safe-remote-image.tsx', 'utf8')
    expect(sheet).toContain('SafeRemoteImage')
    expect(sheet).toContain('previewDisplaySrc(link.url, link.image)')
    expect(sheet).toContain('previewImageAlt(')
    expect(sheet).not.toMatch(/<img src=\{link\.image\}/)
    expect(card).toContain('useSafeRemoteImage')
    expect(card).toContain('previewDisplaySrc(link.url, link.image)')
    expect(card).toContain('previewImageAlt(')
    expect(card).not.toMatch(/src=\{link\.image!\}/)
    expect(safe).toContain("referrerPolicy: 'no-referrer'")
    expect(safe).toContain('naturalWidth === 0')
    expect(safe).toContain('onError:')
    expect(safe).toContain('is-pending')
  })
  it('the proxy is member-only, takes the page URL, and uses the SSRF-safe byte fetch', () => {
    const route = readFileSync('src/app/api/link-preview-image/route.ts', 'utf8')
    const lib = readFileSync('src/lib/link-preview-image.ts', 'utf8')
    const server = readFileSync('src/lib/link-preview-server.ts', 'utf8')
    expect(route).toContain('getMember()')
    expect(route).toContain('checkFetchUrl(raw)')
    expect(route).toContain('fetchPreviewImageBytes(raw)')
    expect(lib).toContain('safeFetchBytes')
    expect(lib).toContain('bypassCache: true')
    expect(server).toContain('opts?: { bypassCache?: boolean }')
  })
})

vi.mock('@/lib/link-preview-server', () => ({
  fetchLinkPreview: vi.fn(),
}))
vi.mock('@/lib/safe-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/safe-fetch')>()
  return { ...actual, safeFetchBytes: vi.fn() }
})

describe('fetchPreviewImageBytes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('serves sniffed JPEG bytes from a stored image URL and does not refresh the unfurl', async () => {
    const { safeFetchBytes } = await import('@/lib/safe-fetch')
    const { fetchLinkPreview } = await import('@/lib/link-preview-server')
    const { fetchPreviewImageBytes } = await import('@/lib/link-preview-image')
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#abcdef' } }).jpeg().toBuffer()
    vi.mocked(safeFetchBytes).mockResolvedValue({
      ok: true,
      finalUrl: 'https://cdn.example/photo.jpg',
      contentType: 'image/jpeg',
      body: jpeg,
      redirects: [],
    })
    const got = await fetchPreviewImageBytes('https://example.com/post', 'https://cdn.example/photo.jpg')
    expect(got?.contentType).toBe('image/jpeg')
    expect(got?.body.equals(jpeg)).toBe(true)
    expect(fetchLinkPreview).not.toHaveBeenCalled()
    expect(safeFetchBytes).toHaveBeenCalledWith('https://cdn.example/photo.jpg', expect.any(Number))
  })

  it('skips non-image bytes and refreshes the unfurl when the stored CDN URL is dead', async () => {
    const { safeFetchBytes } = await import('@/lib/safe-fetch')
    const { fetchLinkPreview } = await import('@/lib/link-preview-server')
    const { fetchPreviewImageBytes } = await import('@/lib/link-preview-image')
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#221111' } }).jpeg().toBuffer()
    vi.mocked(safeFetchBytes)
      .mockResolvedValueOnce({ ok: false, error: 'http_403', redirects: [] })
      .mockResolvedValueOnce({
        ok: true,
        finalUrl: 'https://cdn.example/fresh.jpg',
        contentType: 'image/jpeg',
        body: jpeg,
        redirects: [],
      })
    vi.mocked(fetchLinkPreview)
      .mockResolvedValueOnce({
        url: 'https://www.instagram.com/p/x/',
        title: 'old',
        description: null,
        image: 'https://cdn.example/expired.jpg',
        site_name: 'Instagram',
        favicon: null,
        link_type: 'other',
      })
      .mockResolvedValueOnce({
        url: 'https://www.instagram.com/p/x/',
        title: 'new',
        description: null,
        image: 'https://cdn.example/fresh.jpg',
        site_name: 'Instagram',
        favicon: null,
        link_type: 'other',
      })
    const got = await fetchPreviewImageBytes('https://www.instagram.com/p/x/', 'https://cdn.example/expired.jpg')
    expect(got?.contentType).toBe('image/jpeg')
    expect(got?.body.equals(jpeg)).toBe(true)
    expect(fetchLinkPreview).toHaveBeenCalledWith('https://www.instagram.com/p/x/')
    expect(fetchLinkPreview).toHaveBeenCalledWith('https://www.instagram.com/p/x/', { bypassCache: true })
  })

  it('returns null for SVG or other unsensible payloads', async () => {
    const { safeFetchBytes } = await import('@/lib/safe-fetch')
    const { fetchLinkPreview } = await import('@/lib/link-preview-server')
    const { fetchPreviewImageBytes } = await import('@/lib/link-preview-image')
    vi.mocked(safeFetchBytes).mockResolvedValue({
      ok: true,
      finalUrl: 'https://cdn.example/x.svg',
      contentType: 'image/svg+xml',
      body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      redirects: [],
    })
    vi.mocked(fetchLinkPreview).mockResolvedValue({
      url: 'https://example.com/a',
      title: 't',
      description: null,
      image: 'https://cdn.example/x.svg',
      site_name: 'Ex',
      favicon: null,
      link_type: 'article',
    })
    expect(await fetchPreviewImageBytes('https://example.com/a', 'https://cdn.example/x.svg')).toBeNull()
  })
})
