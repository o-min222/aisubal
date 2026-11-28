import { msg } from '@/i18n/translate'

/**
 * Global search (top bar ⌘K + /search). Pure: unit-tested.
 * Searched: members by nickname (display_name) or @handle, feed and Agora posts by title/body,
 * and 갤러리 items. Never the anon board, and never a member's 부캐 (alt nickname), since
 * matching it would link an alias to a real profile.
 */
export const SEARCH_TABS = [
  { id: 'all', label: msg('전체') },
  { id: 'people', label: msg('사람') },
  { id: 'feed', label: msg('피드') },
  { id: 'agora', label: msg('아고라') },
  { id: 'gallery', label: msg('갤러리') },
  { id: 'articles', label: msg('아티클') },
] as const
export type SearchTab = (typeof SEARCH_TABS)[number]['id']

export function parseSearchTab(v: string | null | undefined): SearchTab {
  return SEARCH_TABS.some((t) => t.id === v) ? (v as SearchTab) : 'all'
}

const SEARCH_MAX_LEN = 60

/**
 * Normalizes a query for ilike filters: trims, caps the length, and drops characters that
 * are wildcards in LIKE (% _) or separators in PostgREST filter strings (, ( ) " ' \ *).
 * Returns null when nothing searchable is left.
 */
export function cleanQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const q = raw.replace(/[%_,()"'\\*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX_LEN).trim()
  return q.length >= 1 ? q : null
}

/** A short excerpt around the first match (for result rows). */
export function snippet(text: string, q: string, width = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const i = flat.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0 || flat.length <= width) return flat.length > width ? `${flat.slice(0, width - 1)}…` : flat
  const start = Math.max(0, Math.min(i - Math.floor(width / 3), flat.length - width))
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + width).trim()}${start + width < flat.length ? '…' : ''}`
}
