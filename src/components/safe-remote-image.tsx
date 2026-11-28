'use client'

import { useRef, useState, useSyncExternalStore, type ImgHTMLAttributes, type RefCallback, type SyntheticEvent } from 'react'

const subscribe = () => () => {}
const clientSnap = () => true
const serverSnap = () => false

/** True only after hydration, so the <img> mounts with onLoad/onError already attached. */
function useIsClient() {
  return useSyncExternalStore(subscribe, clientSnap, serverSnap)
}

type SafeRemoteImageState = {
  /** src is set, we are on the client, and the image has not failed */
  active: boolean
  /** the image loaded with a non-zero naturalWidth */
  visible: boolean
  imgProps: (ImgHTMLAttributes<HTMLImageElement> & { ref: RefCallback<HTMLImageElement> }) | null
}

/**
 * A104: load a remote (or proxied) image without ever showing a broken-image
 * glyph. The <img> is clipped to nothing until onLoad reports a real width;
 * onError and a 0×0 naturalWidth hide it completely. referrerPolicy is always
 * no-referrer so a hotlink-protected CDN isn't tripped by our origin.
 */
export function useSafeRemoteImage(src: string | null | undefined): SafeRemoteImageState {
  const isClient = useIsClient()
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [seen, setSeen] = useState(src)
  if (src !== seen) {
    setSeen(src)
    setFailed(false)
    setLoaded(false)
  }
  const node = useRef<HTMLImageElement | null>(null)

  const finish = (el: HTMLImageElement) => {
    if (el.naturalWidth === 0) setFailed(true)
    else setLoaded(true)
  }

  const ref: RefCallback<HTMLImageElement> = (el) => {
    node.current = el
    // a cached image may already be complete when the node attaches, with no second onLoad
    if (el?.complete) queueMicrotask(() => { if (node.current === el) finish(el) })
  }

  const active = Boolean(src) && isClient && !failed
  if (!active || !src) return { active: false, visible: false, imgProps: null }
  return {
    active: true,
    visible: loaded && !failed,
    imgProps: {
      ref,
      src,
      loading: 'lazy',
      decoding: 'async',
      referrerPolicy: 'no-referrer',
      onLoad: (e: SyntheticEvent<HTMLImageElement>) => finish(e.currentTarget),
      onError: () => setFailed(true),
    },
  }
}

export function SafeRemoteImage({
  src,
  alt,
  className,
}: {
  src: string | null | undefined
  alt: string
  className?: string
}) {
  const { active, visible, imgProps } = useSafeRemoteImage(src)
  if (!active || !imgProps) return null
  return (
    <span className={visible ? 'safe-remote-img' : 'safe-remote-img is-pending'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...imgProps} alt={alt} className={className} />
    </span>
  )
}
