'use client'

import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useT } from '@/i18n/client'
import type { RecKind } from '@/lib/data/rec-dismissals'
import { postRecDismiss } from '@/lib/rec-dismiss'

/** One recommended item with a quiet "관심 없음" ×; collapses to an undo line when dismissed. */
export function RecDismiss({ kind, refId, children }: { kind: RecKind; refId: string; children: ReactNode }) {
  const t = useT()
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)

  const toggle = async (next: boolean) => {
    if (busy) return
    setBusy(true)
    setHidden(next)
    const ok = await postRecDismiss(kind, refId, next)
    if (!ok) setHidden(!next)
    setBusy(false)
  }

  if (hidden) {
    return (
      <li className="rec-undo" aria-live="polite">
        <span>{t('추천에서 뺐어요')}</span>
        <button type="button" className="rec-undo-btn" onClick={() => toggle(false)} disabled={busy}>{t('되돌리기')}</button>
      </li>
    )
  }
  return (
    <li className="rec-item">
      {children}
      <button type="button" className="rec-x" aria-label={t('관심 없음')} title={t('관심 없음')} onClick={() => toggle(true)} disabled={busy}>
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  )
}
