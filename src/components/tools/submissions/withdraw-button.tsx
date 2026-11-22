'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn } from '@/i18n/client'

export function WithdrawButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function go() {
    if (busy || !confirm(tn('‘{name}’ 등록 요청을 철회할까요?', { name }))) return
    setBusy(true)
    const res = await fetch(`/api/tools/submissions/${id}`, { method: 'DELETE' })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return toast.error(d.error || tn('철회하지 못했어요.'))
    toast.success(tn('요청을 철회했어요'))
    router.refresh()
  }
  return (
    <button type="button" onClick={go} disabled={busy} className="btn btn-secondary btn-sm rounded-full min-h-[36px]">
      {busy ? <T>철회 중…</T> : <T>요청 철회</T>}
    </button>
  )
}
