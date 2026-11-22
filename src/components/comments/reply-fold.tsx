'use client'

import { useState, type ReactNode } from 'react'
import { tx } from '@/i18n/client'

/** The tail of a long 대댓글 run, behind '답글 N개 더 보기' (the thread line runs into it). */
export function ReplyFold({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  if (open) return <>{children}</>
  return (
    <li className="comment-more">
      <button type="button" className="reply-fold-btn" onClick={() => setOpen(true)} aria-expanded={false}>
        {tx('답글 {count}개 더 보기', { count })}
      </button>
    </li>
  )
}
