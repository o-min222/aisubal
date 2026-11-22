'use client'

import { useState } from 'react'
import { Bookmark, Check, Loader2 } from 'lucide-react'
import type { ArchiveSourceType } from '@/lib/supabase/types'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn } from '@/i18n/client'

interface SaveToArchiveButtonProps {
  sourceType: ArchiveSourceType
  sourceId: string
  title?: string
  className?: string
  initiallySaved?: boolean
}

export function SaveToArchiveButton({
  sourceType,
  sourceId,
  title,
  className = '',
  initiallySaved = false,
}: SaveToArchiveButtonProps) {
  const [saved, setSaved] = useState(initiallySaved)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (saved || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: sourceType,
          source_id: sourceId,
          title,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || tn('저장 실패'))
        return
      }
      setSaved(true)
      toast.success(data.created ? tn('세컨드 브레인에 저장했습니다.') : tn('이미 저장된 항목입니다.'))
    } catch {
      toast.error(tn('네트워크 오류'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void save()}
      disabled={busy}
      className={`btn ${saved ? 'btn-primary' : 'btn-secondary'} btn-sm ${className}`}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : saved ? (
        <Check className="w-4 h-4" />
      ) : (
        <Bookmark className="w-4 h-4" />
      )}
      {saved ? <T>저장됨</T> : <T>저장</T>}
    </button>
  )
}
