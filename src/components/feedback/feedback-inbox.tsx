'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageSquareText } from 'lucide-react'
import { toast } from 'sonner'
import { RelativeTime } from '@/components/relative-time'
import { FeedbackStatusBadge } from '@/components/feedback/feedback-status'
import { FeedbackRejectSheet } from '@/components/feedback/feedback-reject-sheet'
import type { FeedbackItem } from '@/lib/feedback'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'

/** A119: inbox rows, with a 거절 action that opens the reason sheet. */
export function FeedbackInbox({ initial }: { initial: FeedbackItem[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [target, setTarget] = useState<FeedbackItem | null>(null)
  const [busy, setBusy] = useState(false)

  async function reject(reason: string | null) {
    if (!target) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/feedback/${target.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', note: reason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('처리하지 못했어요.'))
      if (data.item) setItems((list) => list.map((x) => (x.id === data.item.id ? data.item : x)))
      toast.success(tn('거절했어요. 상대에게 전했어요.'))
      setTarget(null)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ul className="card divide-y divide-n-eee">
        {items.map((f) => {
          const canReject = f.status === 'pending' || f.status === 'approved'
          return (
            <li key={f.id} className="fb-inbox-row">
              <Link href={`/admin/feedback/${f.id}`} className="fb-row">
                {f.hasShot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/feedback-shot/${f.id}`} alt="" className="fb-thumb" loading="lazy" />
                ) : (
                  <span className="fb-thumb is-empty" aria-hidden><MessageSquareText className="w-5 h-5" /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 mb-0.5">
                    <FeedbackStatusBadge status={f.status} />
                    <span className="text-xs text-n-888 truncate">{f.route}</span>
                  </span>
                  <span className="block text-sm text-n-111 line-clamp-2">{f.body}</span>
                  <span className="block text-xs text-n-888 mt-0.5">
                    {f.author?.name ?? tx('멤버')} · <RelativeTime date={f.createdAt} />
                  </span>
                </span>
              </Link>
              {canReject && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm fb-inbox-reject"
                  onClick={() => setTarget(f)}
                >
                  <T>거절</T>
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <FeedbackRejectSheet open={Boolean(target)} onOpenChange={(o) => { if (!o && !busy) setTarget(null) }} busy={busy} onConfirm={reject} />
    </>
  )
}
