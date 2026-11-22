'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export function WithdrawButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function go() {
    if (busy || !confirm(`‘${name}’ 등록 요청을 철회할까요?`)) return
    setBusy(true)
    const res = await fetch(`/api/tools/submissions/${id}`, { method: 'DELETE' })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return toast.error(d.error || '철회하지 못했어요.')
    toast.success('요청을 철회했어요')
    router.refresh()
  }
  return (
    <button type="button" onClick={go} disabled={busy} className="btn btn-secondary btn-sm rounded-full min-h-[36px]">
      {busy ? '철회 중…' : '요청 철회'}
    </button>
  )
}
