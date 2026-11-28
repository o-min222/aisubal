'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ImagePlus, Images, X } from 'lucide-react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import {
  ARTICLE_IMAGE_MAX_BYTES,
  ARTICLE_IMAGE_TYPES,
  DEFAULT_ARTICLE_FOCUS,
  articleImageSrc,
  firstInlineImagePath,
  type ArticleImageFocus,
} from '@/lib/article-rules'
import { PrepareImageError, prepareImageErrorMessage, prepareUploadImage } from '@/lib/upload-image-client'
import type { ArticleLibraryImage } from '@/lib/data/article-images'
import { ArticleImagePicker } from './article-image-picker'
import { ArticleFramedImage } from './article-framed-image'

type Slot = 'cover' | 'thumbnail'
type Patch = {
  coverPath?: string | null
  thumbnailPath?: string | null
  coverFocus?: ArticleImageFocus | null
  thumbnailFocus?: ArticleImageFocus | null
}

/**
 * A136 + A138: the cover sits above the title. The reading page shows the full cover (no crop).
 * Cards and the share card use a fixed frame: drag the live previews to set a focal point, or turn
 * on '잘리지 않게' to letterbox on a blurred backdrop. A separate thumbnail is optional.
 */
export function ArticleCoverSection({
  coverPath,
  thumbnailPath,
  coverFocus,
  thumbnailFocus,
  body,
  title,
  onChange,
}: {
  coverPath: string | null
  thumbnailPath: string | null
  coverFocus: ArticleImageFocus | null
  thumbnailFocus: ArticleImageFocus | null
  body: string
  title: string
  onChange: (patch: Patch) => void
}) {
  const [thumbOn, setThumbOn] = useState(Boolean(thumbnailPath))
  const [picker, setPicker] = useState<Slot | null>(null)
  const [busy, setBusy] = useState<Slot | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const slotRef = useRef<Slot>('cover')

  const first = firstInlineImagePath(body)
  const cover = articleImageSrc(coverPath)
  const thumb = articleImageSrc(thumbnailPath)
  const firstSrc = articleImageSrc(first)
  const coverF = coverFocus ?? DEFAULT_ARTICLE_FOCUS
  const thumbF = thumbnailFocus ?? DEFAULT_ARTICLE_FOCUS

  const cardPick = thumbnailPath
    ? { src: thumb, via: tx('썸네일'), focus: thumbF, slot: 'thumbnail' as const, canFocus: true }
    : coverPath
      ? { src: cover, via: tx('커버'), focus: coverF, slot: 'cover' as const, canFocus: true }
      : first
        ? { src: firstSrc, via: tx('본문 첫 이미지'), focus: DEFAULT_ARTICLE_FOCUS, slot: null, canFocus: false }
        : { src: null, via: tx('글자'), focus: DEFAULT_ARTICLE_FOCUS, slot: null, canFocus: false }
  const sharePick = coverPath
    ? { src: cover, via: tx('커버'), focus: coverF, slot: 'cover' as const, canFocus: true }
    : thumbnailPath
      ? { src: thumb, via: tx('썸네일'), focus: thumbF, slot: 'thumbnail' as const, canFocus: true }
      : first
        ? { src: firstSrc, via: tx('본문 첫 이미지'), focus: DEFAULT_ARTICLE_FOCUS, slot: null, canFocus: false }
        : { src: null, via: tx('기본 카드'), focus: DEFAULT_ARTICLE_FOCUS, slot: null, canFocus: false }

  function setPath(slot: Slot, path: string | null) {
    if (slot === 'cover') onChange({ coverPath: path, coverFocus: path ? DEFAULT_ARTICLE_FOCUS : null })
    else onChange({ thumbnailPath: path, thumbnailFocus: path ? DEFAULT_ARTICLE_FOCUS : null })
  }

  function setFocus(slot: Slot, focus: ArticleImageFocus) {
    onChange(slot === 'cover' ? { coverFocus: focus } : { thumbnailFocus: focus })
  }

  function choose(slot: Slot) {
    slotRef.current = slot
    fileRef.current?.click()
  }

  async function onFile(file: File | undefined) {
    const slot = slotRef.current
    if (!file) return
    setBusy(slot)
    try {
      const f = await prepareUploadImage(file, { maxBytes: ARTICLE_IMAGE_MAX_BYTES, maxSide: 2000, allow: ARTICLE_IMAGE_TYPES })
      const form = new FormData()
      form.set('file', f)
      form.set('kind', slot)
      const res = await fetch('/api/article-image', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return toast.error(data.error || tn('이미지를 올리지 못했어요.'))
      setPath(slot, data.path as string)
      if (slot === 'thumbnail') setThumbOn(true)
      if (!data.image) toast.message(tn('이미지는 올렸지만 보관함에는 저장하지 못했어요.'))
    } catch (e) {
      toast.error(e instanceof PrepareImageError ? prepareImageErrorMessage(e.code, (s) => tn(s)) : tn('이미지를 올리지 못했어요.'))
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function pick(img: ArticleLibraryImage) {
    if (!picker) return
    setPath(picker, img.path)
    if (picker === 'thumbnail') setThumbOn(true)
  }

  function toggleThumb(next: boolean) {
    setThumbOn(next)
    if (!next) setPath('thumbnail', null)
  }

  return (
    <section className="article-cover-editor" aria-label={tx('커버 이미지')}>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <div className="article-cover-head">
        <h2 className="article-cover-title"><T>커버 이미지</T></h2>
        <p className="article-cover-hint"><T>읽는 화면은 이미지를 자르지 않고 그대로 보여 줘요. 카드와 공유 미리보기는 아래 칸을 끌어 보이는 위치를 맞춰 주세요.</T></p>
      </div>

      <div className={`article-cover-stage${cover ? ' has-image' : ''}`}>
        {cover ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" aria-hidden className="article-cover-stage-blur" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" className="article-cover-img" />
          </>
        ) : (
          <button type="button" className="article-cover-empty" onClick={() => choose('cover')} disabled={busy === 'cover'}>
            <ImagePlus className="w-6 h-6" aria-hidden />
            <span className="article-cover-empty-title"><T>커버 이미지 올리기</T></span>
            <span className="article-cover-empty-sub"><T>가로로 넓은 이미지가 잘 어울려요</T></span>
          </button>
        )}
      </div>
      <div className="article-cover-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => choose('cover')} disabled={busy === 'cover'}>
          <ImagePlus className="w-4 h-4" aria-hidden /> {coverPath ? <T>바꾸기</T> : <T>이미지 올리기</T>}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicker('cover')}>
          <Images className="w-4 h-4" aria-hidden /> <T>내 이미지에서 고르기</T>
        </button>
        {coverPath && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPath('cover', null)}>
            <X className="w-4 h-4" aria-hidden /> <T>제거</T>
          </button>
        )}
      </div>

      <div className="article-cover-previews" aria-label={tx('이미지가 보이는 모양 미리보기')}>
        <FocusPreview
          label={tx('카드 썸네일')}
          caption={tx('정사각 · {via}', { via: cardPick.via })}
          boxClass="article-crop-square"
          src={cardPick.src}
          focus={cardPick.focus}
          canFocus={cardPick.canFocus}
          fallback={<span className="article-crop-letter" aria-hidden>{(title || '아').slice(0, 1)}</span>}
          onFocusChange={cardPick.slot ? (f) => setFocus(cardPick.slot!, f) : undefined}
        />
        <FocusPreview
          label={tx('공유 카드')}
          caption={tx('세로 칸 · {via}', { via: sharePick.via })}
          boxClass="article-crop-share"
          src={sharePick.src}
          focus={sharePick.focus}
          canFocus={sharePick.canFocus}
          fallback={<span className="article-crop-letter article-crop-brand" aria-hidden>AI쓰발</span>}
          onFocusChange={sharePick.slot ? (f) => setFocus(sharePick.slot!, f) : undefined}
        />
      </div>

      <div className="article-thumb-opt">
        <div className="article-thumb-row">
          <div className="min-w-0">
            <p className="article-thumb-label"><T>썸네일 따로 지정</T></p>
            <p className="article-cover-hint"><T>카드와 피드의 작은 정사각 이미지만 다르게 쓰고 싶을 때 켜세요. 끄면 커버를 그대로 써요.</T></p>
          </div>
          <ToggleSwitch checked={thumbOn} onChange={toggleThumb} label={tx('썸네일 따로 지정')} />
        </div>
        {thumbOn && (
          <div className="article-thumb-body">
            <div className="article-crop-box article-crop-square article-thumb-preview">
              {thumb ? (
                <ArticleFramedImage src={thumb} focus={thumbF} interactive className="article-thumb-preview" onFocusChange={(f) => setFocus('thumbnail', f)} />
              ) : (
                <ImagePlus className="w-5 h-5" aria-hidden />
              )}
            </div>
            <div className="article-cover-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => choose('thumbnail')} disabled={busy === 'thumbnail'}>
                <ImagePlus className="w-4 h-4" aria-hidden /> {thumbnailPath ? <T>바꾸기</T> : <T>정사각 이미지 올리기</T>}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicker('thumbnail')}>
                <Images className="w-4 h-4" aria-hidden /> <T>내 이미지에서 고르기</T>
              </button>
              {thumbnailPath && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPath('thumbnail', null)}>
                  <X className="w-4 h-4" aria-hidden /> <T>제거</T>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <ArticleImagePicker
        open={picker !== null}
        onOpenChange={(o) => !o && setPicker(null)}
        title={picker === 'thumbnail' ? tx('썸네일 고르기') : tx('커버 고르기')}
        currentPath={picker === 'thumbnail' ? thumbnailPath : coverPath}
        onPick={pick}
      />
    </section>
  )
}

function FocusPreview({
  label,
  caption,
  boxClass,
  src,
  focus,
  canFocus,
  fallback,
  onFocusChange,
}: {
  label: string
  caption: string
  boxClass: string
  src: string | null
  focus: ArticleImageFocus
  canFocus: boolean
  fallback: ReactNode
  onFocusChange?: (focus: ArticleImageFocus) => void
}) {
  return (
    <figure className="article-crop">
      <div className={`article-crop-box ${boxClass}`}>
        {src ? (
          <ArticleFramedImage src={src} focus={focus} interactive={canFocus} onFocusChange={canFocus ? onFocusChange : undefined} />
        ) : (
          fallback
        )}
      </div>
      <figcaption>
        {label}
        <span>{caption}</span>
      </figcaption>
      {src && canFocus && onFocusChange && <FitToggle focus={focus} onChange={onFocusChange} />}
    </figure>
  )
}

function FitToggle({ focus, onChange }: { focus: ArticleImageFocus; onChange: (focus: ArticleImageFocus) => void }) {
  return (
    <div className="article-fit-row">
      <ToggleSwitch
        checked={focus.fit === 'contain'}
        onChange={(on) => onChange({ ...focus, fit: on ? 'contain' : 'crop' })}
        label={tx('잘리지 않게')}
      />
      <p className="article-cover-hint"><T>켜면 이미지 전체가 들어가고, 빈 자리는 흐린 배경으로 채워요.</T></p>
    </div>
  )
}
