'use client'

import { useState, type ReactNode } from 'react'
import { tx } from '@/i18n/client'

/** Collapses a long 대댓글 list behind '답글 N개 보기'. Opens by itself when the reply being answered is inside. */
export function ReplyFold({ count, initiallyOpen, children }: { count: number; initiallyOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen)
  if (!open) {
    return (
      <button type="button" className="reply-fold-btn" onClick={() => setOpen(true)} aria-expanded={false}>
        {tx('답글 {count}개 보기', { count })}
      </button>
    )
  }
  return (
    <>
      {children}
      {!initiallyOpen && (
        <button type="button" className="reply-fold-btn" onClick={() => setOpen(false)} aria-expanded>
          {tx('답글 숨기기')}
        </button>
      )}
    </>
  )
}
