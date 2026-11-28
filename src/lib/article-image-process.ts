/**
 * A136: an image an AGENT uploads for an article (MCP article_image_upload / cover / thumbnail params).
 * Same limits as the website's /api/article-image: JPEG, PNG, WebP or GIF, at most 4 MB in. Input is never trusted:
 *  - the type comes from the magic bytes, not from a header or a file name
 *  - at most 40 MP decoded (decompression bombs)
 *  - EXIF orientation is applied, the longest side is capped, and the image is re-encoded as JPEG (PNG when it has
 *    transparency); every metadata block (EXIF/GPS, XMP, ICC) is dropped. An animated GIF becomes its first frame.
 * The result is stored by mcp_article_image_put (0153) in the owner's library and served from /api/article-image.
 */
import sharp from 'sharp'
import { ARTICLE_AGENT_IMAGE_MAX_SIDE, ARTICLE_AGENT_IMAGE_OUT_MAX, ARTICLE_IMAGE_MAX_BYTES } from '@/lib/article-rules'

const MAX_PIXELS = 40_000_000

export type ArticleImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export function sniffArticleImage(b: Uint8Array): ArticleImageMime | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif'
  return null
}

export type ArticleImageResult =
  | { ok: true; bytes: Buffer; mime: 'image/jpeg' | 'image/png'; width: number; height: number; inputMime: ArticleImageMime }
  | { ok: false; error: 'too_large' | 'not_image' | 'decode_failed' }

export async function processArticleImage(input: Uint8Array): Promise<ArticleImageResult> {
  if (input.length > ARTICLE_IMAGE_MAX_BYTES) return { ok: false, error: 'too_large' }
  const inputMime = sniffArticleImage(input)
  if (!inputMime) return { ok: false, error: 'not_image' }
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error', animated: false }).metadata()
    const alpha = Boolean(meta.hasAlpha)
    for (const [q, side] of [[85, ARTICLE_AGENT_IMAGE_MAX_SIDE], [78, ARTICLE_AGENT_IMAGE_MAX_SIDE], [72, 1600], [68, 1280]] as const) {
      const base = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error', animated: false })
        .rotate()
        .resize(side, side, { fit: 'inside', withoutEnlargement: true })
      const out = alpha
        ? await base.png({ compressionLevel: 9, palette: q < 80 }).toBuffer({ resolveWithObject: true })
        : await base.jpeg({ quality: q, mozjpeg: true }).toBuffer({ resolveWithObject: true })
      if (out.data.length <= ARTICLE_AGENT_IMAGE_OUT_MAX) {
        return { ok: true, bytes: out.data, mime: alpha ? 'image/png' : 'image/jpeg', width: out.info.width, height: out.info.height, inputMime }
      }
    }
    return { ok: false, error: 'too_large' }
  } catch {
    return { ok: false, error: 'decode_failed' }
  }
}
