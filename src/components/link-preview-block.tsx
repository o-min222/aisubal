'use client'

import { useState } from 'react'
import { ExternalLink, Play } from 'lucide-react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { LinkCard, type LinkCardData } from '@/components/link-card'
import { embedOf } from '@/lib/link-embed'
import { youtubeThumbnail } from '@/lib/link-preview'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * A58: the one expanded link of a post.
 *  - YouTube / Shorts / Vimeo: a click-to-load facade (thumbnail + play). Nothing from the video
 *    host loads until the reader taps; then a youtube-nocookie / Vimeo dnt player, no autoplay.
 *  - anything else: the compact card; tapping opens a sheet (side panel on desktop) with the
 *    summary and '원문 열기', so reading never jumps straight out of the feed.
 */
export function LinkPreviewBlock({ link }: { link: LinkCardData }) {
  const embed = embedOf(link.url)
  const [playing, setPlaying] = useState(false)
  const [open, setOpen] = useState(false)

  if (embed) {
    const thumb = link.image || (embed.kind === 'youtube' ? youtubeThumbnail(link.url) : null)
    return (
      <div className={`link-embed ${embed.vertical ? 'is-vertical' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="link-embed-frame">
          {playing ? (
            <iframe
              src={embed.src}
              title={link.title || tx('영상')}
              allow="encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              loading="lazy"
            />
          ) : (
            <button type="button" className="link-embed-facade" onClick={() => setPlaying(true)} aria-label={tx('영상 불러오기: {title}', { title: link.title || hostOf(link.url) })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {thumb && <img src={thumb} alt="" className="link-embed-thumb" loading="lazy" />}
              <span className="link-embed-play" aria-hidden><Play className="w-6 h-6 fill-white text-white" /></span>
            </button>
          )}
        </div>
        <div className="link-embed-meta">
          <span className="link-embed-title">{link.title || hostOf(link.url)}</span>
          <a href={link.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="icon-btn" aria-label={tx('원문 열기')} title={tx('원문 열기')}>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    )
  }

  return (
    <>
      <LinkCard compact link={link} onOpen={() => setOpen(true)} />
      <AdaptiveSheet open={open} onOpenChange={setOpen} title={link.site_name || hostOf(link.url)}>
        <div className="link-sheet" onClick={(e) => e.stopPropagation()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {link.image && <img src={link.image} alt="" className="link-sheet-img" />}
          <p className="link-sheet-title">{link.title || link.url}</p>
          {link.description && <p className="link-sheet-desc">{link.description}</p>}
          <p className="link-sheet-host">{hostOf(link.url)}</p>
          <a href={link.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="btn btn-primary link-sheet-open">
            <ExternalLink className="w-4 h-4" /> <T>원문 열기</T>
          </a>
        </div>
      </AdaptiveSheet>
    </>
  )
}
