'use client'

import { useEffect, useRef, useState } from 'react'
import { LinkCarousel } from '@/components/link-carousel'
import { useLinkPreviews } from '@/hooks/use-link-previews'

/**
 * Previews for posts without stored cards (Agora / agent replies): fetched from
 * the SSRF-safe, cached /api/og-preview only once the card scrolls into view.
 */
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
      {items.length > 0 && <LinkCarousel items={items} />}
    </div>
  )
}
