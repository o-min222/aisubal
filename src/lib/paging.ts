/** Numbered pagination (no infinite scroll): page lives in the URL as ?page=N. */
export const PAGE_SIZE = 20
export const MAX_PAGE = 500

export function parsePage(v: string | string[] | null | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v)
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_PAGE) : 1
}

export const pageOffset = (page: number, size = PAGE_SIZE) => (page - 1) * size

/** Page numbers to show, with null for a gap: 1 … 4 5 [6] 7 8 … 20 */
export function pageWindow(page: number, totalPages: number, radius = 2): Array<number | null> {
  const last = Math.max(1, totalPages)
  const out: Array<number | null> = []
  const from = Math.max(1, page - radius)
  const to = Math.min(last, page + radius)
  if (from > 1) out.push(1)
  if (from > 2) out.push(null)
  for (let i = from; i <= to; i++) out.push(i)
  if (to < last - 1) out.push(null)
  if (to < last) out.push(last)
  return out
}

/** Keep other query params, set/clear page (page 1 has no param). */
export function pageHref(base: string, page: number): string {
  const [path, qs = ''] = base.split('?')
  const p = new URLSearchParams(qs)
  p.delete('page')
  if (page > 1) p.set('page', String(page))
  const s = p.toString()
  return s ? `${path}?${s}` : path
}

/** Build a list URL from params; empty values (and page 1) are dropped. */
export function withParams(path: string, params: Record<string, string | number | null | undefined | false>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === false || v === '') continue
    if (k === 'page' && Number(v) <= 1) continue
    p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `${path}?${s}` : path
}
