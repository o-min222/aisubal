'use client'

import { POST_IMAGE_MAX_BYTES, POST_IMAGE_MAX_SIDE, POST_IMAGE_TYPES } from '@/lib/quick-post-rules'

export type PickedImage = { path: string; preview: string }

/** Big screenshots shrink to ≤ 2000px WebP before upload; small ones and GIFs go as they are. */
async function shrink(file: File): Promise<File> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return file
  const scale = Math.min(1, POST_IMAGE_MAX_SIDE / Math.max(bmp.width, bmp.height))
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) return file
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.9))
  return blob && blob.size < file.size ? new File([blob], 'image.webp', { type: 'image/webp' }) : file
}

/** Upload one image for a post; throws a user-facing message. */
export async function uploadPickedImage(file: File, t: (s: string) => string): Promise<PickedImage> {
  if (!POST_IMAGE_TYPES[file.type]) throw new Error(t('PNG·JPG·WEBP·GIF만 올릴 수 있어요.'))
  const f = await shrink(file)
  if (f.size > POST_IMAGE_MAX_BYTES) throw new Error(t('4MB 이하 이미지만 올릴 수 있어요.'))
  const fd = new FormData()
  fd.set('file', f)
  const res = await fetch('/api/posts/image', { method: 'POST', body: fd })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || typeof data.path !== 'string') throw new Error(data.error || t('업로드하지 못했어요.'))
  return { path: data.path, preview: URL.createObjectURL(f) }
}
