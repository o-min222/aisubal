'use client'

import { isHeicType, sniffUploadImageType } from '@/lib/upload-image'

export class PrepareImageError extends Error {
  constructor(readonly code: 'image_type' | 'image_size' | 'image_heic') {
    super(code)
  }
}

/** Shrink or transcode a still image to WebP (GIFs stay as they are). Returns null if the browser cannot decode it. */
async function transcodeWebp(file: File, maxSide: number): Promise<File | null> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return null
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return null
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024 && !isHeicType(sniffUploadImageType(file))) {
    bmp.close()
    return null
  }
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * scale))
  c.height = Math.max(1, Math.round(bmp.height * scale))
  c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.9))
  bmp.close()
  return blob ? new File([blob], 'image.webp', { type: 'image/webp' }) : null
}

/**
 * Normalize a picked screenshot for upload: sniff empty MIME types, convert HEIC
 * when the browser can, and shrink large stills to WebP ≤ maxSide.
 */
export async function prepareUploadImage(
  file: File,
  opts: { maxBytes: number; maxSide: number; allow: Record<string, string> },
): Promise<File> {
  const type = sniffUploadImageType(file)
  if (!type) throw new PrepareImageError('image_type')
  if (!opts.allow[type] && !isHeicType(type)) throw new PrepareImageError('image_type')

  const converted = type === 'image/gif' ? null : await transcodeWebp(file, opts.maxSide)
  if (isHeicType(type) && !converted) throw new PrepareImageError('image_heic')
  const out = converted && (isHeicType(type) || converted.size < file.size || file.size > opts.maxBytes) ? converted : file
  if (!opts.allow[out.type]) throw new PrepareImageError('image_type')
  if (out.size > opts.maxBytes) throw new PrepareImageError('image_size')
  return out
}

export function prepareImageErrorMessage(code: string, t: (s: string) => string): string {
  if (code === 'image_type') return t('PNG·JPG·WEBP·GIF만 올릴 수 있어요.')
  if (code === 'image_size') return t('4MB 이하 이미지만 올릴 수 있어요.')
  if (code === 'image_heic') return t('이 HEIC 이미지는 변환하지 못했어요. PNG나 JPG로 저장해 주세요.')
  return t('업로드하지 못했어요.')
}
