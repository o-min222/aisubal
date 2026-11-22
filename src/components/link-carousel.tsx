'use client'

import { useCallback, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { LinkCard, type LinkCardData } from '@/components/link-card'

export type CarouselItem = LinkCardData | { url: string; loading: true }

const isLoading = (i: CarouselItem): i is { url: string; loading: true } => 'loading' in i

/**
 * Link previews: one card on its own, several as a horizontal swipeable
 * carousel (scroll-snap) with dots, plus arrows on pointer devices.
 * Pass onRemove to show an X on each card (composer).
 */
export function LinkCarousel({ items, onRemove, label = '링크 미리보기' }: { items: CarouselItem[]; onRemove?: (url: string) => void; label?: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const multi = items.length > 1

  const onScroll = useCallback(() => {
    const el = track.current
    if (!el) return
    const kids = [...el.children] as HTMLElement[]
    const left = el.scrollLeft
    let best = 0
    kids.forEach((k, i) => {
      if (Math.abs(k.offsetLeft - el.offsetLeft - left) < Math.abs(kids[best].offsetLeft - el.offsetLeft - left)) best = i
    })
    setActive(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 ? kids.length - 1 : best)
  }, [])

  // clamp when a card is removed
  const current = Math.min(active, Math.max(0, items.length - 1))

  const go = (i: number) => {
    const el = track.current
    const kid = el?.children[i] as HTMLElement | undefined
    if (el && kid) el.scrollTo({ left: kid.offsetLeft - el.offsetLeft, behavior: 'smooth' })
  }

  if (!items.length) return null

  const card = (it: CarouselItem) =>
    isLoading(it) ? (
      <div className={`link-card link-card-skeleton ${multi ? 'link-card-tile' : 'link-card-compact'}`} aria-busy="true" aria-label="미리보기 불러오는 중">
        <div className="link-card-media" />
        <div className="link-card-body">
          <span className="sk-line w-1/3" />
          <span className="sk-line w-5/6" />
          <span className="sk-line w-2/3" />
        </div>
      </div>
    ) : (
      <LinkCard compact={!multi} tile={multi} link={it} />
    )

  return (
    <div className={`link-carousel ${multi ? 'is-multi' : ''}`} role={multi ? 'region' : undefined} aria-roledescription={multi ? 'carousel' : undefined} aria-label={label}>
      <div ref={track} className="link-carousel-track" onScroll={multi ? onScroll : undefined}>
        {items.map((it, i) => (
          <div key={it.url} className="link-carousel-slide" aria-roledescription={multi ? 'slide' : undefined} aria-label={multi ? `${i + 1} / ${items.length}` : undefined}>
            {card(it)}
            {onRemove && (
              <button type="button" className="link-carousel-remove" aria-label="미리보기 삭제" onClick={() => onRemove(it.url)}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {multi && (
        <>
          <button type="button" className="link-carousel-arrow is-prev" aria-label="이전 미리보기" disabled={current === 0} onClick={() => go(current - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" className="link-carousel-arrow is-next" aria-label="다음 미리보기" disabled={current >= items.length - 1} onClick={() => go(current + 1)}>
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="link-carousel-dots" role="tablist" aria-label="미리보기 선택">
            {items.map((it, i) => (
              <button key={it.url} type="button" role="tab" aria-selected={i === current} aria-label={`${i + 1}번째 미리보기`} className={i === current ? 'on' : ''} onClick={() => go(i)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
