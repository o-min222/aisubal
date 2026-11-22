import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { pageHref, pageWindow } from '@/lib/paging'
import { getT } from '@/i18n/server'
import { msg } from '@/i18n/translate'

/**
 * Numbered pagination. Pass totalPages when the total is known; otherwise hasNext
 * (we only know whether one more page exists).
 */
export async function Pagination({ base, page, totalPages, hasNext, label = msg('페이지') }: { base: string; page: number; totalPages?: number; hasNext?: boolean; label?: string }) {
  const st = await getT()
  const last = totalPages ?? (hasNext ? page + 1 : page)
  if (last <= 1 && page <= 1) return null
  const nums = pageWindow(page, last)
  const cell = 'inline-flex items-center justify-center rounded-full min-w-[40px] h-10 px-2 text-[14px] tabular-nums'
  return (
    <nav className="pagination flex items-center justify-center gap-1 py-3 flex-wrap" aria-label={st(label)}>
      {page > 1 ? (
        <Link href={pageHref(base, page - 1)} className={`${cell} hover:bg-[#f2f2f2]`} aria-label={st('이전 페이지')} rel="prev">
          <ChevronLeft className="w-4 h-4" />
        </Link>
      ) : (
        <span className={`${cell} text-[#ccc]`} aria-hidden>
          <ChevronLeft className="w-4 h-4" />
        </span>
      )}
      {nums.map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} className={`${cell} text-[#aaa]`} aria-hidden>
            …
          </span>
        ) : n === page ? (
          <span key={n} className={`${cell} font-semibold`} style={{ background: '#111', color: '#fff' }} aria-current="page">
            {n}
          </span>
        ) : (
          <Link key={n} href={pageHref(base, n)} className={`${cell} hover:bg-[#f2f2f2]`} style={{ color: '#333' }} aria-label={st('{n}페이지', { n })}>
            {n}
          </Link>
        )
      )}
      {page < last ? (
        <Link href={pageHref(base, page + 1)} className={`${cell} hover:bg-[#f2f2f2]`} aria-label={st('다음 페이지')} rel="next">
          <ChevronRight className="w-4 h-4" />
        </Link>
      ) : (
        <span className={`${cell} text-[#ccc]`} aria-hidden>
          <ChevronRight className="w-4 h-4" />
        </span>
      )}
    </nav>
  )
}
