'use client'

import { POST_IMAGE_MAX_BYTES, POST_IMAGE_MAX_SIDE, POST_IMAGE_TYPES } from '@/lib/quick-post-rules'
import { PrepareImageError, prepareImageErrorMessage, prepareUploadImage } from '@/lib/upload-image-client'

export type PickedImage = { path: string; preview: string }

/** Upload one image for a post; throws a user-facing message. */
export async function uploadPickedImage(file: File, t: (s: string) => string): Promise<PickedImage> {
  let f: File
  try {
    f = await prepareUploadImage(file, { maxBytes: POST_IMAGE_MAX_BYTES, maxSide: POST_IMAGE_MAX_SIDE, allow: POST_IMAGE_TYPES })
  } catch (e) {
    if (e instanceof PrepareImageError) throw new Error(prepareImageErrorMessage(e.code, t))
    throw e
  }
  const fd = new FormData()
  fd.set('file', f)
  const res = await fetch('/api/posts/image', { method: 'POST', body: fd })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || typeof data.path !== 'string') throw new Error(data.error || t('업로드하지 못했어요.'))
  return { path: data.path, preview: URL.createObjectURL(f) }
}
