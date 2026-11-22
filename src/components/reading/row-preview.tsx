'use client'

import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import type { LinkCardData } from '@/components/link-card'
import { videoEmbed } from '@/lib/video-embed'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
const safeImg = (src: string | null | undefined) => (src && /^https:\/\//.test(src) ? src : null)

/** Compact link card: thumbnail, 2-line title, domain. Opens the link in a new tab. */
function RowLink({ link, more }: { link: LinkCardData; more: number }) {
  const [imgOk, setImgOk] = useState(true)
  const host = hostOf(link.url)
  const img = safeImg(link.image) ?? safeImg(link.favicon)
  const isX = link.link_type === 'x'
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="rp-link">
      <span className="rp-thumb" aria-hidden>
        {img && imgOk ? <img src={img} alt="" loading="lazy" onError={() => setImgOk(false)} /> : <span className="rp-thumb-fallback">{isX ? '𝕏' : host.slice(0, 1).toUpperCase()}</span>}
      </span>
      <span className="rp-body">
        <span className="rp-title">{link.title || host}</span>
        <span className="rp-host">
          {host}
          {more > 0 && <span className="rp-more"><T s="링크 +{n}" vars={{ n: more }} /></span>}
        </span>
      </span>
    </a>
  )
}

/** Video thumbnail that becomes the provider's player on tap (no autoload). */
function RowVideo({ link, more }: { link: LinkCardData; more: number }) {
  const v = videoEmbed(link.url, link.image)!
  const [playing, setPlaying] = useState(false)
  const thumb = v.thumb ?? safeImg(link.image)
  const title = link.title || (v.provider === 'youtube' ? 'YouTube' : 'Vimeo')
  if (playing) {
    return (
      <div className="rp-video is-playing">
        <iframe
          src={v.embedUrl}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      </div>
    )
  }
  return (
    <div className="rp-video-wrap">
      <button type="button" className="rp-video" onClick={() => setPlaying(true)} aria-label={tx('{title} 재생', { title })}>
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="rp-video-blank" />}
        <span className="rp-play" aria-hidden>
          <Play className="w-5 h-5" />
        </span>
      </button>
      <span className="rp-host">
        <span className="truncate">{title}</span>
        <span className="flex-shrink-0">· {v.provider === 'youtube' ? 'YouTube' : 'Vimeo'}</span>
        {more > 0 && <span className="rp-more"><T s="링크 +{n}" vars={{ n: more }} /></span>}
      </span>
    </div>
  )
}

/** X post: compact card that expands into the official embed on tap; height follows the embed's resize messages. */
function RowX({ link, more }: { link: LinkCardData; more: number }) {
  const v = videoEmbed(link.url)!
  const [open, setOpen] = useState(false)
  const [height, setHeight] = useState(360)
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    if (!open) return
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== 'https://platform.twitter.com' || e.source !== frame.current?.contentWindow) return
      let d: unknown = e.data
      if (typeof d === 'string') {
        try {
          d = JSON.parse(d)
        } catch {
          return
        }
      }
      const emb = (d as { 'twttr.embed'?: { method?: string; params?: { height?: number }[] } })?.['twttr.embed']
      const h = emb?.method === 'twttr.private.resize' ? Number(emb.params?.[0]?.height) : NaN
      if (h > 80 && h < 3000) setHeight(Math.ceil(h))
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [open])
  if (open) {
    const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    return (
      <div className="rp-x">
        <iframe ref={frame} src={`${v.embedUrl}&theme=${dark ? 'dark' : 'light'}`} title={link.title || 'X'} style={{ height }} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    )
  }
  const img = safeImg(link.image)
  return (
    <button type="button" className="rp-link" onClick={() => setOpen(true)} aria-label={tx('X 게시물 펼치기')}>
      <span className="rp-thumb" aria-hidden>
        {img ? <img src={img} alt="" loading="lazy" /> : <span className="rp-thumb-fallback">𝕏</span>}
        <span className="rp-play rp-play-sm"><Play className="w-3.5 h-3.5" /></span>
      </span>
      <span className="rp-body">
        <span className="rp-title">{link.title || link.description || tx('X 게시물')}</span>
        <span className="rp-host">
          x.com
          {more > 0 && <span className="rp-more"><T s="링크 +{n}" vars={{ n: more }} /></span>}
        </span>
      </span>
    </button>
  )
}

function Preview({ link, more }: { link: LinkCardData; more: number }) {
  const v = videoEmbed(link.url, link.image)
  if (v?.provider === 'x') return <RowX link={link} more={more} />
  return v ? <RowVideo link={link} more={more} /> : <RowLink link={link} more={more} />
}

/**
 * Link / video preview under a list row (feed, 익명, 아고라). Stored previews
 * render immediately; agent posts have none, so their first link is fetched
 * from the SSRF-safe /api/og-preview once the row scrolls into view.
 */
export function RowPreview({ previews, liveUrls = [] }: { previews: LinkCardData[]; liveUrls?: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<LinkCardData | null>(null)
  const first = previews[0] ?? null
  const liveUrl = !first ? liveUrls[0] : undefined

  useEffect(() => {
    const el = ref.current
    if (!el || !liveUrl) return
    let done = false
    const load = () => {
      if (done) return
      done = true
      // videos need no fetch: the embed card works from the URL alone
      if (videoEmbed(liveUrl)?.provider === 'youtube' || videoEmbed(liveUrl)?.provider === 'vimeo') return setLive({ url: liveUrl, title: null, description: null, image: null, site_name: null, favicon: null, link_type: null })
      fetch(`/api/og-preview?url=${encodeURIComponent(liveUrl)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.preview && setLive(d.preview as LinkCardData))
        .catch(() => null)
        .finally(() => videoEmbed(liveUrl)?.provider === 'x' && setLive((p) => p ?? { url: liveUrl, title: null, description: null, image: null, site_name: null, favicon: null, link_type: 'x' }))
    }
    if (typeof IntersectionObserver === 'undefined') return load()
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (load(), io.disconnect()), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [liveUrl])

  const link = first ?? live
  const more = first ? previews.length - 1 : Math.max(0, liveUrls.length - 1)
  if (!link && !liveUrl) return null
  return (
    <div ref={ref} className="rp">
      {link && <Preview link={link} more={more} />}
    </div>
  )
}
