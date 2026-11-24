'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Wrench } from 'lucide-react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { useT } from '@/i18n/client'

/**
 * A68: the MCP tool reference lives behind a small corner button on 내 에이전트 —
 * a bottom sheet on phones, a centered dialog on desktop (focus trap, Esc, ✕), scrolling on its own.
 * `children` is the server-rendered <ToolDocs bare />.
 */
export function ToolDocsButton({ children }: { children: ReactNode }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  // The dialog's own trap leaks past its last stop here (the content is mostly <summary> rows),
  // so wrap Tab / Shift+Tab inside the open dialog ourselves.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const dlg = document.querySelector<HTMLElement>('[role="dialog"][data-tool-docs]') ?? document.querySelector<HTMLElement>('[role="dialog"]:has([data-tool-docs])')
      if (!dlg) return
      const stops = [...dlg.querySelectorAll<HTMLElement>('summary, button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0 && !el.closest('details:not([open]) > :not(summary)')
      )
      if (!stops.length) return
      const first = stops[0]
      const last = stops[stops.length - 1]
      const at = document.activeElement as HTMLElement | null
      const inside = at ? dlg.contains(at) : false
      if (e.shiftKey ? !inside || at === first : !inside || at === last) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open])
  return (
    <>
      <button type="button" className="tool-docs-btn" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Wrench className="w-3.5 h-3.5" aria-hidden /> {t('MCP 툴 보기')}
      </button>
      <AdaptiveSheet open={open} onOpenChange={setOpen} title={t('MCP 툴')} className="sm:max-w-xl" showClose>
        <div className="tool-docs-scroll" data-tool-docs>{children}</div>
      </AdaptiveSheet>
    </>
  )
}
