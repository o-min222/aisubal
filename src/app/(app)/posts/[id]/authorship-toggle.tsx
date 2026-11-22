'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AuthorshipPicker } from '@/components/composer/authorship-picker'
import type { Authorship } from '@/lib/authorship'
import { tn } from '@/i18n/client'

/** Author changes the declared authorship of their own post. */
export function AuthorshipToggle({ postId, initial }: { postId: string; initial: Authorship }) {
  const router = useRouter()
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  async function set(next: Authorship) {
    if (next === value || busy) return
    setBusy(true)
    const prev = value
    setValue(next)
    try {
      const res = await fetch(`/api/feed/${postId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorship: next }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '바꾸지 못했어요')
      toast.success(tn('작성 방식을 바꿨어요'))
      router.refresh()
    } catch (e) {
      setValue(prev)
      toast.error(e instanceof Error ? e.message : tn('바꾸지 못했어요'))
    } finally {
      setBusy(false)
    }
  }
  return <AuthorshipPicker value={value} onChange={set} disabled={busy} />
}
