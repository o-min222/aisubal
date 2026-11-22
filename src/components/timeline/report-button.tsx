'use client'

import { useState } from 'react'
import { Flag } from 'lucide-react'
import { toast } from 'sonner'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { FEED_REPORT_REASONS } from '@/lib/feed-rules'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

/** Report a feed post (incl. '개인정보 노출'). Admins review in 관리 › 신고. */
export function ReportButton({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!reason || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, reason: detail.trim() ? `${reason}: ${detail.trim()}` : reason }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || '신고하지 못했어요.')
      toast.success(tn('신고를 접수했어요. 운영진이 확인할게요.'))
      setOpen(false)
      setReason('')
      setDetail('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('신고하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="tap-target inline-flex items-center justify-center rounded-full text-n-999 hover:bg-n-f2f2f2 hover:text-n-111" aria-label={tx('신고')} title={tx('신고')}>
        <Flag className="w-[15px] h-[15px]" />
      </button>
      <AdaptiveSheet open={open} onOpenChange={setOpen} title={tx('게시물 신고')}>
        <div className="space-y-3">
          <div role="radiogroup" aria-label={tx('신고 사유')} className="space-y-1.5">
            {FEED_REPORT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 rounded-xl px-3 min-h-[44px] cursor-pointer" style={{ border: reason === r ? '2px solid var(--n-111)' : '1px solid var(--n-eee)' }}>
                <input type="radio" name={`report-${postId}`} value={r} checked={reason === r} onChange={() => setReason(r)} />
                <span className="text-[14px]" style={{ color: 'var(--n-111)' }}>
                  {r}
                </span>
              </label>
            ))}
          </div>
          {reason === '개인정보 노출' && <p className="text-[12px] text-c-8a4b00"><T>전화번호·주소·실명 등 누구의 정보인지 적어주면 빠르게 가릴게요.</T></p>}
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} maxLength={300} placeholder={tx('자세한 내용 (선택)')} className="w-full rounded-xl border border-n-ddd px-3 py-2 text-[15px]" aria-label={tx('신고 상세')} />
          <button type="button" onClick={submit} disabled={!reason || busy} className="btn btn-primary w-full min-h-[44px] rounded-full">
            {busy ? <T>접수 중…</T> : <T>신고하기</T>}
          </button>
        </div>
      </AdaptiveSheet>
    </>
  )
}
