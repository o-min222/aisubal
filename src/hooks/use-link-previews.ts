'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LinkCardData } from '@/components/link-card'
import type { CarouselItem } from '@/components/link-carousel'
import { extractUrls, MAX_LINK_PREVIEWS } from '@/lib/link-preview'

const DEBOUNCE_MS = 450

/**
 * Live previews for links typed or pasted into a composer: debounced, cached per
 * URL for the session, fetched from the SSRF-safe /api/og-preview. Removed URLs
 * stay removed while the text still contains them.
 */
export function useLinkPreviews(text: string, enabled = true) {
  const [removed, setRemoved] = useState<string[]>([])
  const [data, setData] = useState<Record<string, LinkCardData | 'error'>>({})
  const inflight = useRef(new Set<string>())
  // extract more than the cap so removing one lets the next link take its place
  const all = useMemo(() => (enabled ? extractUrls(text, MAX_LINK_PREVIEWS + 8) : []), [text, enabled])
  const urls = useMemo(() => all.filter((u) => !removed.includes(u)).slice(0, MAX_LINK_PREVIEWS), [all, removed])
  const [debounced, setDebounced] = useState<string[]>([])

  useEffect(() => {
    // paste (several chars at once) previews immediately; typing waits for a pause
    const t = setTimeout(() => setDebounced(urls), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [urls])

  useEffect(() => {
    for (const url of debounced) {
      if (data[url] || inflight.current.has(url)) continue
      inflight.current.add(url)
      fetch(`/api/og-preview?url=${encodeURIComponent(url)}`)
        .then(async (r) => (r.ok ? ((await r.json()).preview as LinkCardData) : 'error'))
        .catch(() => 'error' as const)
        .then((v) => setData((d) => ({ ...d, [url]: v ?? 'error' })))
        .finally(() => inflight.current.delete(url))
    }
  }, [debounced, data])

  const items: CarouselItem[] = useMemo(
    () =>
      debounced
        .filter((u) => urls.includes(u))
        .map((u) => {
          const d = data[u]
          if (!d) return { url: u, loading: true as const }
          if (d === 'error') return { url: u, title: null, description: null, image: null, site_name: null, favicon: null, link_type: null }
          return d
        }),
    [debounced, urls, data]
  )

  const remove = useCallback((url: string) => setRemoved((r) => (r.includes(url) ? r : [...r, url])), [])
  const reset = useCallback(() => {
    setRemoved([])
    setDebounced([])
  }, [])

  return { items, urls, remove, reset }
}
