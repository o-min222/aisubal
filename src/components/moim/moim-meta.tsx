import { CalendarDays, Globe, MapPin } from 'lucide-react'
import type { Moim } from '@/lib/data/moim'
import { KstDate } from '@/components/kst-date'
import { T } from '@/i18n/t'

/** A29: what a 모임 is at a glance — date (time if set) · 온/오프 · 지역. */
export function MoimMeta({ m, className = '' }: { m: Pick<Moim, 'startsAt' | 'timeTbd' | 'mode' | 'venueName'>; className?: string }) {
  return (
    <p className={`moim-meta ${className}`}>
      <span>
        <CalendarDays className="w-4 h-4" />
        {m.timeTbd ? (
          <>
            <KstDate iso={m.startsAt} part="date" /> <span className="text-n-888"><T>· 시간 미정</T></span>
          </>
        ) : (
          <KstDate iso={m.startsAt} />
        )}
      </span>
      <span className="min-w-0">
        {m.mode === 'online' ? <Globe className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
        <span className="truncate">
          {m.mode === 'online' ? <T>온라인</T> : m.venueName ? <T s="오프라인 · {v}" vars={{ v: m.venueName }} /> : <T>오프라인</T>}
        </span>
      </span>
    </p>
  )
}
