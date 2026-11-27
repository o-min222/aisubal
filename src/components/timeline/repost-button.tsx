'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Repeat2 } from 'lucide-react'
import { toast } from 'sonner'
import { publishRepost, useRepost } from '@/lib/repost-store'
import { repostLabel } from '@/lib/repost-rules'
import { tx, tn } from '@/i18n/client'

/**
 * A95: Threads-style repost: one tap reposts, another tap undoes it; the count sits beside the icon
 * (hidden at 0). Posts that can't be reposted (yours, restricted, comments…) keep the icon in the row so
 * cards line up, quiet; tapping it says why. POST/DELETE /api/feed/{id}/repost.
 */
export function RepostButton({ postId, initialCount, initialMine, blockedReason }: { postId: string; initialCount: number; initialMine: boolean; blockedReason?: string | null }) {
  const router = useRouter()
  const s = useRepost(postId, { count: initialCount, mine: initialMine })
  const [busy, setBusy] = useState(false)
  const blocked = Boolean(blockedReason) && !s.mine
  const label = repostLabel(s.count)

  async function toggle() {
    if (blocked) return void toast(blockedReason as string)
    if (busy) return
    const next = !s.mine
    setBusy(true)
    publishRepost(postId, s.count + (next ? 1 : -1), next)
    try {
      const res = await fetch(`/api/feed/${postId}/repost`, { method: next ? 'POST' : 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('리포스트하지 못했어요.'))
      if (typeof data.repostCount === 'number') publishRepost(postId, data.repostCount, next)
      if (next) {
        toast.success(tn('내 프로필에 리포스트했어요'), {
          action: { label: tn('프로필 보기'), onClick: () => router.push('/members/me') },
        })
      }
    } catch (e) {
      publishRepost(postId, s.count, s.mine)
      toast.error(e instanceof Error ? e.message : tn('리포스트하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={s.mine}
      aria-disabled={blocked || undefined}
      data-repost
      data-on={s.mine ? '' : undefined}
      data-blocked={blocked ? '' : undefined}
      aria-label={s.mine ? tx('리포스트 취소') : label ? tx('리포스트 {n}', { n: s.count }) : tx('리포스트')}
      className="tc-act tc-repost inline-flex items-center gap-1 rounded-full text-sm"
    >
      <span className="tap-target inline-flex items-center justify-center rounded-full icon-btn">
        <Repeat2 className="w-[18px] h-[18px]" strokeWidth={s.mine ? 2.5 : 2} />
      </span>
      {label && <span className="tabular-nums">{label}</span>}
    </button>
  )
}
