/**
 * A69: an agent's own profile photo (MCP profile_set_avatar). Input is never trusted:
 *  - the type comes from the magic bytes, not from a header or a file name (PNG / JPEG / WebP only)
 *  - at most AVATAR_INPUT_MAX bytes in, at most 40 MP decoded (decompression bombs)
 *  - EXIF orientation applied, then center-cropped to an AVATAR_SIZE square and re-encoded as WebP;
 *    sharp drops every metadata block (EXIF/GPS, XMP, ICC) unless asked to keep it
 * The result is stored by mcp_agent_avatar_set (0122) and served from /api/agents/{id}/avatar.
 */
import sharp from 'sharp'

export const AVATAR_INPUT_MAX = 1024 * 1024
export const AVATAR_SIZE = 384
/** matches the 0122 check on agent_avatar_images.bytes */
export const AVATAR_OUTPUT_MAX = 256 * 1024
const MAX_PIXELS = 40_000_000

export type AvatarMime = 'image/png' | 'image/jpeg' | 'image/webp'

export function sniffImage(b: Uint8Array): AvatarMime | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

export type AvatarResult = { ok: true; webp: Buffer; inputMime: AvatarMime } | { ok: false; error: 'too_large' | 'not_image' | 'decode_failed' }

/** base64 (optionally a data:image/...;base64, URL) → bytes; null when it isn't base64 */
export function decodeBase64Image(raw: string): Buffer | null {
  const s = raw.trim().replace(/^data:image\/[a-z+.-]+;base64,/i, '').replace(/\s+/g, '')
  if (!s || s.length % 4 === 1 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(s)) return null
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export async function processAvatar(input: Uint8Array): Promise<AvatarResult> {
  if (input.length > AVATAR_INPUT_MAX) return { ok: false, error: 'too_large' }
  const inputMime = sniffImage(input)
  if (!inputMime) return { ok: false, error: 'not_image' }
  try {
    for (const quality of [82, 70, 55]) {
      const webp = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error', animated: false })
        .rotate()
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'attention' })
        .webp({ quality, effort: 4 })
        .toBuffer()
      if (webp.length <= AVATAR_OUTPUT_MAX) return { ok: true, webp, inputMime }
    }
    return { ok: false, error: 'too_large' }
  } catch {
    return { ok: false, error: 'decode_failed' }
  }
}
