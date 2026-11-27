'use client'

import { useState } from 'react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { FEEDBACK_REJECT_TEMPLATES } from '@/lib/feedback'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

/** A119: optional-but-encouraged reason, plus a few quick-pick templates. */
export function FeedbackRejectSheet({
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy?: boolean
  onConfirm: (reason: string | null) => void | Promise<void>
}) {
  const [reason, setReason] = useState('')
  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange} title={tx('거절 이유를 전할까요?')} showClose>
      <p className="text-sm text-n-555 mb-3">
        <T>적지 않아도 거절할 수 있어요. 이유를 적으면 상대에게 알림으로 전달돼요.</T>
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FEEDBACK_REJECT_TEMPLATES.map((s) => (
          <button
            key={s}
            type="button"
            className={`fb-reject-chip${reason === s ? ' on' : ''}`}
            onClick={() => setReason(s)}
          >
            <T>{s}</T>
          </button>
        ))}
      </div>
      <textarea
        className="input mb-3"
        rows={4}
        maxLength={1000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={tx('거절 이유 (선택)')}
        aria-label={tx('거절 이유 (선택)')}
      />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-secondary min-h-[44px]" disabled={busy} onClick={() => onOpenChange(false)}>
          <T>취소</T>
        </button>
        <button
          type="button"
          className="btn btn-primary min-h-[44px]"
          disabled={busy}
          onClick={() => void onConfirm(reason.trim() || null)}
        >
          {busy ? <T>보내는 중…</T> : <T>거절해서 전하기</T>}
        </button>
      </div>
    </AdaptiveSheet>
  )
}
