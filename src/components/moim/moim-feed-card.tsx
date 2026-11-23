'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import type { TimelineMoim } from '@/components/timeline/types'
import { MoimMeta } from './moim-meta'
import { RsvpBadge } from './moim-badges'
import { T } from '@/i18n/t'
import { tn } from '@/i18n/client'

/**
 * A30: a 모임's thread post as it appears in the feed — what / when / where, who's in, and one
 * action: 참여하기 when a single tap is enough, otherwise 모임 보기 (questions, approval, managing).
 */
export function MoimFeedCard({ moim: m }: { moim: TimelineMoim }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [joined, setJoined] = useState<TimelineMoim['myRsvp']>(null)
  const rsvp = joined ?? m.myRsvp
  const href = `/moim/${m.id}`

  async function join() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/moim/${m.id}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: {} }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('처리하지 못했어요.'))
      setJoined(data.status ?? 'pending')
      toast.success(data.status === 'confirmed' ? tn('참여가 확정됐어요') : data.status === 'waitlisted' ? tn('정원이 차서 대기 명단에 올렸어요') : tn('신청했어요 · 호스트가 확인하면 알려드려요'))
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`moim-feed-card${m.ended ? ' is-ended' : ''}`}>
      <p className="mfc-kicker">
        <CalendarDays className="w-3.5 h-3.5" aria-hidden /> <T>모임 안내</T>
        {m.groupName && <span className="truncate">· {m.groupName}</span>}
        {m.ended && <span className="mfc-ended">{m.cancelled ? <T>취소됨</T> : <T>종료됨</T>}</span>}
      </p>
      <Link href={href} className="mfc-title">
        {m.title}
      </Link>
      <MoimMeta m={m} className="mfc-meta" />
      <div className="mfc-foot">
        <span className="mfc-count">
          <T s="참여 {n}/{cap}" vars={{ n: m.confirmed, cap: m.capacity }} />
          {m.invited > 0 && <> · <T s="초대 {n}명" vars={{ n: m.invited }} /></>}
        </span>
        {rsvp && <RsvpBadge status={rsvp} />}
        {m.canJoin && !rsvp ? (
          <button type="button" className="mfc-join" onClick={join} disabled={busy}>
            {busy ? <T>신청 중…</T> : <T>참여하기</T>}
          </button>
        ) : (
          <Link href={href} className="mfc-open">
            {m.canManage && !m.ended ? <T>관리하기</T> : <T>이 모임 보기</T>} <ChevronRight className="w-4 h-4" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  )
}
