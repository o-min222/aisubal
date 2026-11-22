'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Flag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { ANON_REPORT_REASONS } from '@/lib/anon-rules'
import type { TimelinePost } from '@/components/timeline/types'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

/** "…" menu on 익명 cards: 신고 (others' posts) or 삭제 (own posts). */
export function AnonActions({ post, afterDelete }: { post: TimelinePost; afterDelete?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'menu' | 'report'>('menu')
  const [reason, setReason] = useState<string>('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [reported, setReported] = useState(Boolean(post.reportedByMe))

  if (post.isDeleted) return null

  function close(v: boolean) {
    setOpen(v)
    if (!v) {
      setStep('menu')
      setReason('')
      setDetail('')
    }
  }

  async function report() {
    if (!reason || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/anon/${post.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, detail }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '신고하지 못했어요.')
      setReported(true)
      close(false)
      toast.success(data.hidden ? tn('신고가 누적되어 글이 숨겨졌어요.') : tn('신고했어요. 운영자가 확인할게요.'))
      if (data.hidden) router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('신고하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (busy || !confirm(tn('이 글을 삭제할까요? 답글이 달린 글은 "삭제된 글"로 남아요.'))) return
    setBusy(true)
    try {
      const res = await fetch(`/api/anon/${post.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '삭제하지 못했어요.')
      close(false)
      toast.success(tn('삭제했어요'))
      if (afterDelete && !data.tombstone) router.push(afterDelete)
      else router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('삭제하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap-target inline-flex items-center justify-center rounded-full text-n-777 hover:bg-n-f2f2f2 hover:text-n-111"
        aria-label={tx('더보기')}
      >
        <MoreHorizontal className="w-[18px] h-[18px]" />
      </button>
      <AdaptiveSheet open={open} onOpenChange={close} title={step === 'report' ? tx('신고하기') : tx('글 메뉴')}>
        {step === 'menu' ? (
          <div className="flex flex-col py-1">
            {post.isMine ? (
              <button type="button" onClick={remove} disabled={busy} className="sheet-row text-red-600">
                <Trash2 className="w-5 h-5" /> <T>삭제하기</T>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep('report')}
                disabled={reported}
                className="sheet-row text-red-600 disabled:text-n-999"
              >
                <Flag className="w-5 h-5" /> {reported ? <T>이미 신고한 글이에요</T> : <T>신고하기</T>}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div className="flex flex-col" role="radiogroup" aria-label={tx('신고 사유')}>
              {ANON_REPORT_REASONS.map((r) => (
                <label key={r} className="sheet-row cursor-pointer">
                  <input
                    type="radio"
                    name={`reason-${post.id}`}
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="w-4 h-4 accent-n-111"
                  />
                  <T>{r}</T>
                </label>
              ))}
            </div>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={150}
              rows={2}
              placeholder={tx('덧붙일 내용 (선택)')}
              className="input w-full text-sm"
            />
            <p className="text-xs text-n-888">
              <T>신고는 익명으로 처리돼요. 여러 명이 신고하면 글이 자동으로 숨겨지고 운영자가 검토해요.</T>
            </p>
            <button type="button" onClick={report} disabled={!reason || busy} className="btn btn-primary w-full min-h-[44px]">
              {busy ? <T>신고 중…</T> : <T>신고하기</T>}
            </button>
          </div>
        )}
      </AdaptiveSheet>
    </>
  )
}
