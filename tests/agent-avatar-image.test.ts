import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { AVATAR_INPUT_MAX, AVATAR_SIZE, decodeBase64Image, processAvatar, sniffImage } from '@/lib/agent-avatar-image'
import { safeFetchBytes } from '@/lib/safe-fetch'
import { getTool } from '@/lib/mcp/registry'

// A69: agents set their own photo over MCP (profile_set_avatar). Bytes and URLs come from the agent.
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#d97757' } }).png().toBuffer()

describe('avatar image processing', () => {
  it('sniffs the type from the magic bytes only', async () => {
    expect(sniffImage(await png(4, 4))).toBe('image/png')
    expect(sniffImage(await sharp(await png(4, 4)).jpeg().toBuffer())).toBe('image/jpeg')
    expect(sniffImage(await sharp(await png(4, 4)).webp().toBuffer())).toBe('image/webp')
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(sniffImage(Buffer.from('GIF89a......'))).toBeNull()
  })

  it('crops to a square WebP and drops EXIF', async () => {
    const withExif = await sharp(await png(900, 400)).jpeg().withExif({ IFD0: { Copyright: 'secret-gps-owner', Artist: 'someone' } }).toBuffer()
    expect((await sharp(withExif).metadata()).exif).toBeTruthy()
    const r = await processAvatar(withExif)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const meta = await sharp(r.webp).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', AVATAR_SIZE, AVATAR_SIZE])
    expect(meta.exif).toBeUndefined()
    expect(r.webp.includes(Buffer.from('secret-gps-owner'))).toBe(false)
  })

  it('refuses non-images, broken images and anything over 1 MB', async () => {
    expect(await processAvatar(Buffer.from('<html>hi</html>'))).toEqual({ ok: false, error: 'not_image' })
    const broken = Buffer.concat([(await png(8, 8)).subarray(0, 20), Buffer.alloc(40)])
    expect(await processAvatar(broken)).toEqual({ ok: false, error: 'decode_failed' })
    const big = Buffer.concat([await png(8, 8), Buffer.alloc(AVATAR_INPUT_MAX)])
    expect(await processAvatar(big)).toEqual({ ok: false, error: 'too_large' })
  })

  it('decodes base64 and data URLs, rejects junk', async () => {
    const b = await png(2, 2)
    expect(decodeBase64Image(b.toString('base64'))?.equals(b)).toBe(true)
    expect(decodeBase64Image(`data:image/png;base64,${b.toString('base64')}`)?.equals(b)).toBe(true)
    expect(decodeBase64Image('not base64!')).toBeNull()
  })
})

describe('avatar URL fetch (SSRF)', () => {
  it.each([
    ['http://example.com/a.png', 'scheme_not_allowed'],
    ['https://127.0.0.1/a.png', 'blocked_address'],
    ['https://[::1]/a.png', 'blocked_address'],
    ['https://169.254.169.254/latest/meta-data', 'blocked_address'],
    ['https://10.0.0.5/a.png', 'blocked_address'],
    ['https://localhost/a.png', 'blocked_host'],
    ['https://printer.local/a.png', 'blocked_host'],
    ['https://example.com:8443/a.png', 'port_not_allowed'],
    ['https://user:pw@example.com/a.png', 'credentials_in_url'],
    ['file:///etc/passwd', 'scheme_not_allowed'],
  ])('%s → %s', async (url, error) => {
    const r = await safeFetchBytes(url, AVATAR_INPUT_MAX)
    expect(r).toMatchObject({ ok: false, error })
  })
})

describe('profile_set_avatar tool', () => {
  it('is a profile write tool open to every agent (no new scope)', () => {
    const t = getTool('profile_set_avatar')
    expect(t).toBeTruthy()
    expect(t!.scopes).toEqual(['always'])
    expect(t!.write).toBe(true)
    expect(Object.keys((t!.input as unknown as { shape: Record<string, unknown> }).shape).sort()).toEqual(['imageBase64', 'reset', 'url'])
    expect(getTool('profile_update')!.description).not.toMatch(/owner sets the model and photo/)
  })
})
