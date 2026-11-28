'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Images, X } from 'lucide-react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { ARTICLE_IMAGE_MAX_BYTES, ARTICLE_IMAGE_TYPES, articleImageSrc, firstInlineImagePath } from '@/lib/article-rules'
import { PrepareImageError, prepareImageErrorMessage, prepareUploadImage } from '@/lib/upload-image-client'
import type { ArticleLibraryImage } from '@/lib/data/article-images'
import { ArticleImagePicker } from './article-image-picker'

type Slot = 'cover' | 'thumbnail'

/**
 * A136: the cover sits above the title. One cover feeds the reading page (wide), the card thumbnail (square crop)
 * and the share card (tall crop); the live previews below show exactly those crops. '썸네일 따로 지정' adds an
 * optional square image used only on cards and the feed. Cards: thumbnail, cover, first body image, letter.
 * Share card: cover, thumbnail, first body image, default.
 */
export function ArticleCoverSection({
  coverPath,
  thumbnailPath,
  body,
  title,
  onChange,
}: {
  coverPath: string | null
  thumbnailPath: string | null
  body: string
  title: string
  onChange: (patch: { coverPath?: string | null; thumbnailPath?: string | null }) => void
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

  // what each surface actually shows (see articleCardImagePath / articleShareImagePath)
  const cardPick = thumbnailPath ? { src: thumb, via: tx('썸네일') } : coverPath ? { src: cover, via: tx('커버') } : first ? { src: firstSrc, via: tx('본문 첫 이미지') } : { src: null, via: tx('글자') }
  const sharePick = coverPath ? { src: cover, via: tx('커버') } : thumbnailPath ? { src: thumb, via: tx('썸네일') } : first ? { src: firstSrc, via: tx('본문 첫 이미지') } : { src: null, via: tx('기본 카드') }

  function set(slot: Slot, path: string | null) {
    onChange(slot === 'cover' ? { coverPath: path } : { thumbnailPath: path })
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
      set(slot, data.path as string)
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
    set(picker, img.path)
    if (picker === 'thumbnail') setThumbOn(true)
  }

  function toggleThumb(next: boolean) {
    setThumbOn(next)
    if (!next) set('thumbnail', null)
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
        <p className="article-cover-hint"><T>읽는 화면 맨 위, 카드, 공유 미리보기에 같이 쓰여요.</T></p>
      </div>

      <div className={`article-cover-stage${cover ? ' has-image' : ''}`}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="article-cover-img" />
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
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('cover', null)}>
            <X className="w-4 h-4" aria-hidden /> <T>제거</T>
          </button>
        )}
      </div>

      <div className="article-cover-previews" aria-label={tx('이미지가 보이는 모양 미리보기')}>
        <figure className="article-crop">
          <div className="article-crop-box article-crop-square">
            {cardPick.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cardPick.src} alt="" />
            ) : (
              <span className="article-crop-letter" aria-hidden>{(title || '아').slice(0, 1)}</span>
            )}
          </div>
          <figcaption><T>카드 썸네일</T><span>{tx('정사각 · {via}', { via: cardPick.via })}</span></figcaption>
        </figure>
        <figure className="article-crop">
          <div className="article-crop-box article-crop-share">
            {sharePick.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sharePick.src} alt="" />
            ) : (
              <span className="article-crop-letter article-crop-brand" aria-hidden>AI쓰발</span>
            )}
          </div>
          <figcaption><T>공유 카드</T><span>{tx('세로 잘림 · {via}', { via: sharePick.via })}</span></figcaption>
        </figure>
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
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" />
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
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('thumbnail', null)}>
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
