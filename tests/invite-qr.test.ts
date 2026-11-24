import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import jsQR from 'jsqr'
import sharp from 'sharp'
import { inviteQrPng, inviteQrSvg, inviteQrUrl, INVITE_QR_OPTS } from '@/lib/invite-qr'
import { inviteUrl } from '@/lib/invite-share'

async function decodePng(buf: Buffer): Promise<string | null> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null
}

describe('A98 · invite QR encodes the ordinary invite link', () => {
  it('is the same /i/{code} URL the copy/share buttons already send (no new endpoint, no extra codes)', () => {
    expect(inviteQrUrl('AXK8M2PQ', 'https://aisubal.vercel.app')).toBe(inviteUrl('AXK8M2PQ', 'https://aisubal.vercel.app'))
    expect(inviteQrUrl('AXK8M2PQ', 'https://aisubal.vercel.app', 'en')).toBe('https://aisubal.vercel.app/i/AXK8M2PQ?lang=en')
    expect(inviteQrUrl('AXK8M2PQ', 'http://127.0.0.1:43210')).toBe('http://127.0.0.1:43210/i/AXK8M2PQ')
  })

  it('the drawn QR (PNG, same options as the on-screen SVG) decodes back to that URL', async () => {
    const url = inviteQrUrl('AXK8M2PQ', 'https://aisubal.vercel.app', 'en')
    const buf = await inviteQrPng(url, 400)
    expect(await decodePng(buf)).toBe(url)
  })

  it('the SVG the overlay actually renders also decodes to the same URL', async () => {
    const url = inviteQrUrl('F1MXA2VT', 'https://aisubal.vercel.app')
    const svg = await inviteQrSvg(url)
    expect(svg).toMatch(/<svg[\s\S]*<\/svg>/)
    const png = await sharp(Buffer.from(svg)).resize(400, 400).png().toBuffer()
    expect(await decodePng(png)).toBe(url)
  })

  it('high-contrast black-on-white, with a quiet zone, and no external QR API', () => {
    expect(INVITE_QR_OPTS.color).toEqual({ dark: '#111111', light: '#ffffff' })
    expect(INVITE_QR_OPTS.margin).toBeGreaterThanOrEqual(1)
    const lib = readFileSync('src/lib/invite-qr.ts', 'utf8')
    expect(lib).toContain("from 'qrcode'")
    expect(lib).not.toMatch(/https?:\/\/[^'"\s]*qr/i)
    const overlay = readFileSync('src/components/invites/invite-qr.tsx', 'utf8')
    expect(overlay).toContain('inviteQrSvg')
    expect(overlay).toContain('inviteQrUrl')
    expect(overlay).toContain('role="dialog"')
    expect(overlay).toContain('createPortal(ui, document.body)')
    expect(overlay).toContain('inviterName')
    expect(overlay).toContain('<T>이 코드는 한 번만 쓸 수 있어요</T>')
    expect(overlay).toContain('남은 초대장 {n}장')
  })
})
