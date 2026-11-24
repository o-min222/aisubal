/**
 * Offline invite QR (A98). Encodes the ordinary /i/{code} link — same redeem
 * path, same single-use codes, no extra allowance. Drawn client-side with the
 * `qrcode` package (no external QR API).
 */
import QRCode from 'qrcode'
import { inviteUrl } from '@/lib/invite-share'

/** Same options the on-screen invite QR is drawn with (tests render and decode with these). */
export const INVITE_QR_OPTS = {
  margin: 2,
  errorCorrectionLevel: 'M' as const,
  color: { dark: '#111111', light: '#ffffff' },
}

/** The QR encodes this URL — the existing invite link, not a new kind of invite. */
export function inviteQrUrl(code: string, origin: string, lang?: string): string {
  return inviteUrl(code, origin, lang)
}

export function inviteQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...INVITE_QR_OPTS, type: 'svg' })
}

export function inviteQrPng(url: string, width = 400): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...INVITE_QR_OPTS, type: 'png', width })
}
