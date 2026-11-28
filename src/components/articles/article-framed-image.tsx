'use client'

import { useRef, type PointerEvent } from 'react'
import { DEFAULT_ARTICLE_FOCUS, clampArticleFocus, type ArticleImageFocus } from '@/lib/article-rules'

/**
 * A138: a fixed frame that either centre-crops (with an optional focal point) or letterboxes on a
 * blurred backdrop. Used on list cards, the feed, and the editor's live previews.
 */
export function ArticleFramedImage({
  src,
  focus,
  className,
  alt = '',
  interactive = false,
  onFocusChange,
}: {
  src: string
  focus?: ArticleImageFocus | null
  className?: string
  alt?: string
  interactive?: boolean
  onFocusChange?: (focus: ArticleImageFocus) => void
}) {
  const f = focus ?? DEFAULT_ARTICLE_FOCUS
  const pos = `${f.x}% ${f.y}%`
  const box = useRef<HTMLSpanElement>(null)
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null)

  function move(e: PointerEvent) {
    if (!interactive || !onFocusChange || !drag.current || !box.current) return
    const img = box.current.querySelector('img.article-frame-img') as HTMLImageElement | null
    const r = box.current.getBoundingClientRect()
    const nw = img?.naturalWidth || 0
    const nh = img?.naturalHeight || 0
    if (nw < 1 || nh < 1 || r.width < 1 || r.height < 1) return
    const scale = f.fit === 'contain' ? Math.min(r.width / nw, r.height / nh) : Math.max(r.width / nw, r.height / nh)
    const overflowX = Math.abs(nw * scale - r.width)
    const overflowY = Math.abs(nh * scale - r.height)
    const sign = f.fit === 'contain' ? 1 : -1
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    onFocusChange({
      ...f,
      x: overflowX < 1 ? drag.current.fx : clampArticleFocus(drag.current.fx + sign * (dx / overflowX) * 100),
      y: overflowY < 1 ? drag.current.fy : clampArticleFocus(drag.current.fy + sign * (dy / overflowY) * 100),
    })
  }

  return (
    <span
      ref={box}
      className={`article-frame${f.fit === 'contain' ? ' is-contain' : ''}${interactive ? ' is-interactive' : ''}${className ? ` ${className}` : ''}`}
      onPointerDown={
        interactive && onFocusChange
          ? (e) => {
              if (e.button !== 0) return
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              drag.current = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y }
            }
          : undefined
      }
      onPointerMove={move}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
    >
      {f.fit === 'contain' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" aria-hidden className="article-frame-blur" style={{ objectPosition: pos }} draggable={false} />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="article-frame-img" style={{ objectFit: f.fit === 'contain' ? 'contain' : 'cover', objectPosition: pos }} draggable={false} />
    </span>
  )
}

/** Reading-page header: always the full cover, never cropped. Tall images letterbox on a blurred backdrop. */
export function ArticleReadCover({ src, alt = '' }: { src: string; alt?: string }) {
  return (
    <figure className="article-read-cover">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden className="article-read-cover-blur" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="article-read-cover-img" />
    </figure>
  )
}
