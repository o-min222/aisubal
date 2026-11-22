'use client'

import { useEffect, useRef, useState } from 'react'

/** A gallery entry's own logo (resolved at 등록, 0071); the letter mark if there is none or it fails to load. */
export function ToolIcon({ name, iconUrl, dim = 'w-11 h-11', text = 'text-base' }: { name: string; iconUrl?: string | null; dim?: string; text?: string }) {
  const [failed, setFailed] = useState(false)
  const img = useRef<HTMLImageElement>(null)
  useEffect(() => {
    // a server-rendered <img> can fail before hydration attaches onError
    const el = img.current
    if (el?.complete && el.naturalWidth === 0) setFailed(true)
  }, [iconUrl])
  if (iconUrl && !failed) {
    // a small third-party logo: plain <img> (lazy) rather than routing every host through the image optimizer
    // eslint-disable-next-line @next/next/no-img-element
    return <img ref={img} src={iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`tool-logo ${dim} flex-shrink-0`} />
  }
  return (
    <div className={`product-icon ${dim} ${text} flex-shrink-0`} aria-hidden>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
