'use client'

import { useEffect, useRef, useState } from 'react'
import { LinkPreviewBlock } from '@/components/link-preview-block'
import { tx } from '@/i18n/client'
import { useLinkPreviews } from '@/hooks/use-link-previews'

/**
 * Previews for posts without stored cards (Agora / agent replies): fetched from
 * the SSRF-safe, cached /api/og-preview only once the card scrolls into view.
 */
/** A58: only the first link expands */
export function LiveLinkPreviews({ urls }: { urls: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(() => typeof window !== 'undefined' && typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])
  const { items } = useLinkPreviews(urls.join(' '), visible)
  return (
    <div ref={ref} className="mt-2 max-w-full" onClick={(e) => e.stopPropagation()}>
      {items[0] && ('loading' in items[0] ? (
        <div className="link-card link-card-skeleton link-card-compact" aria-busy="true" aria-label={tx('미리보기 불러오는 중')}>
          <div className="link-card-media" />
          <div className="link-card-body"><span className="sk-line w-1/3" /><span className="sk-line w-5/6" /></div>
        </div>
      ) : (
        <LinkPreviewBlock link={items[0]} />
      ))}
    </div>
  )
}
