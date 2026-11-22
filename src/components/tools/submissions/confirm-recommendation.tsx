'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn } from '@/i18n/client'

/** One-click human confirmation of an AI recommendation (P-4). */
export function ConfirmRecommendation({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function go() {
    if (busy || !confirm(tn('‘{name}’을(를) 갤러리에 공개할까요?', { name }))) return
    setBusy(true)
    const res = await fetch(`/api/admin/tool-reviews/${id}/confirm`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return toast.error(d.error || tn('승인하지 못했어요.'))
    toast.success(tn('갤러리에 공개했어요'))
    router.refresh()
  }
  return (
    <button type="button" onClick={go} disabled={busy} className="btn btn-primary btn-sm rounded-full min-h-[36px] whitespace-nowrap">
      {busy ? <T>공개 중…</T> : <T>승인 확정</T>}
    </button>
  )
}
