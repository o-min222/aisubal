'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import type { LinkType } from '@/lib/supabase/types'
import { T } from '@/i18n/t'

export type LinkCardData = {
  url: string
  title: string | null
  description: string | null
  image: string | null
  site_name: string | null
  favicon: string | null
  link_type: LinkType | null
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'link'
  }
}

function tileColor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `hsl(${hue} 42% 42%)`
}

export function LinkCard({
  link,
  compact = false,
  tile = false,
  href,
  onOpen,
}: {
  link: LinkCardData
  compact?: boolean
  /** vertical card (image on top) used inside the multi-link carousel */
  tile?: boolean
  href?: string
  /** A58: open a details sheet instead of leaving the page (middle-click / ⌘-click still open the link) */
  onOpen?: () => void
}) {
  const isYoutube = link.link_type === 'youtube'
  const target = href || link.url
  const host = useMemo(() => hostnameOf(link.url), [link.url])
  const [imgFailed, setImgFailed] = useState(false)
  const [faviconFailed, setFaviconFailed] = useState(false)
  const favRef = useRef<HTMLImageElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    // a server-rendered <img> can fail before hydration attaches onError: fall back to the letter then too
    const broken = (el: HTMLImageElement | null) => Boolean(el?.complete && el.naturalWidth === 0)
    if (broken(favRef.current)) setFaviconFailed(true)
    if (broken(imgRef.current)) setImgFailed(true)
  }, [link.favicon, link.image])

  const showImage = Boolean(link.image) && !imgFailed
  const showFavicon = Boolean(link.favicon) && !faviconFailed
  const label = (link.site_name || host).slice(0, 10).toUpperCase()

  return (
    <a
      href={target}
      target="_blank"
      rel="noopener noreferrer"
      className={`link-card group ${compact ? 'link-card-compact' : ''} ${tile ? 'link-card-tile' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        if (onOpen && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      {showImage ? (
        <div className={`link-card-media ${isYoutube ? 'is-video' : ''}`}>
          <img
            ref={imgRef}
            src={link.image!}
            alt=""
            className="link-card-img"
            onError={() => setImgFailed(true)}
          />
          {isYoutube && (
            <span className="link-card-play" aria-hidden>
              <Play className="w-5 h-5 fill-white text-white" />
            </span>
          )}
        </div>
      ) : (
        <div
          className="link-card-media link-card-media-fallback"
          style={{ background: tileColor(host) }}
          aria-hidden
        >
          {showFavicon ? (
            <img
              src={link.favicon!}
              alt=""
              className="link-card-fallback-favicon"
              onError={() => setFaviconFailed(true)}
            />
          ) : (
            <span className="link-card-fallback-label">{label.slice(0, 2)}</span>
          )}
          <span className="link-card-fallback-site"><T>{label}</T></span>
        </div>
      )}
      <div className="link-card-body">
        <div className="link-card-site">
          {showFavicon ? (
            <img
              ref={favRef}
              src={link.favicon!}
              alt=""
              className="link-card-favicon"
              onError={() => setFaviconFailed(true)}
            />
          ) : (
            <span
              className="link-card-favicon-fallback"
              style={{ background: tileColor(host) }}
            >
              {host.charAt(0).toUpperCase()}
            </span>
          )}
          <span>{link.site_name || host}</span>
        </div>
        <div className="link-card-title">{link.title || link.url}</div>
        {link.description && (!compact || link.link_type === 'x') && (
          <p className="link-card-desc">{link.description}</p>
        )}
      </div>
    </a>
  )
}
