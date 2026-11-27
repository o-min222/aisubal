'use client'

import { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tx, tn, useT } from '@/i18n/client'
import { uploadPickedImage } from '@/lib/post-image-client'

export type PostEditImageValue =
  | { kind: 'keep'; preview: string }
  | { kind: 'none' }
  | { kind: 'new'; path: string; preview: string }

export function initialPostEditImage(imageUrl: string | null | undefined): PostEditImageValue {
  return imageUrl ? { kind: 'keep', preview: imageUrl } : { kind: 'none' }
}

export function postEditImageChanged(initialUrl: string | null | undefined, value: PostEditImageValue): boolean {
  if (value.kind === 'new') return true
  if (value.kind === 'none') return Boolean(initialUrl)
  return false
}

export function postEditImagePayload(value: PostEditImageValue): { setImage: true; imagePath: string | null } | null {
  if (value.kind === 'keep') return null
  return { setImage: true, imagePath: value.kind === 'new' ? value.path : null }
}

/** One-image add / replace / remove controls for the feed 글 수정 sheet (A111). */
export function PostEditImage({
  value,
  onChange,
  disabled,
}: {
  value: PostEditImageValue
  onChange: (next: PostEditImageValue) => void
  disabled?: boolean
}) {
  const tr = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const preview = value.kind === 'none' ? null : value.preview

  async function pick(f: File | undefined) {
    if (!f) return
    setUploading(true)
    try {
      const picked = await uploadPickedImage(f, (x) => tr(x))
      if (value.kind === 'new') URL.revokeObjectURL(value.preview)
      onChange({ kind: 'new', path: picked.path, preview: picked.preview })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('업로드하지 못했어요.'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function remove() {
    if (value.kind === 'new') URL.revokeObjectURL(value.preview)
    onChange({ kind: 'none' })
  }

  return (
    <div className="post-edit-image">
      {preview && (
        <div className="composer-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" />
          <button type="button" className="composer-image-x" onClick={remove} disabled={disabled || uploading} aria-label={tx('이미지 빼기')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <button
        type="button"
        className="btn btn-secondary btn-sm whitespace-nowrap"
        onClick={() => fileRef.current?.click()}
        disabled={disabled || uploading}
        aria-label={preview ? tx('이미지 바꾸기') : tx('이미지 한 장')}
      >
        <ImagePlus className="w-4 h-4 flex-shrink-0" />
        {uploading ? <T>올리는 중…</T> : preview ? <T>이미지 바꾸기</T> : <T>이미지 한 장</T>}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif"
        hidden
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  )
}
