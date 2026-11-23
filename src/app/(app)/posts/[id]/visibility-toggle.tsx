'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { VisibilityPicker } from '@/components/composer/visibility-picker'
import type { PostVisibility } from '@/lib/post-visibility'
import { tn, tx } from '@/i18n/client'
import { POST_VISIBILITY_OPTION } from '@/lib/post-visibility'

/** A43: the author changes who can see an existing post (the whole thread follows) */
export function VisibilityToggle({ postId, initial }: { postId: string; initial: PostVisibility }) {
  const router = useRouter()
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  async function set(next: PostVisibility) {
    if (next === value || busy) return
    setBusy(true)
    const prev = value
    setValue(next)
    try {
      const res = await fetch(`/api/feed/${postId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visibility: next }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '바꾸지 못했어요')
      toast.success(tx('공유범위를 ‘{label}’(으)로 바꿨어요', { label: tx(POST_VISIBILITY_OPTION[next].title) }))
      router.refresh()
    } catch (e) {
      setValue(prev)
      toast.error(e instanceof Error ? e.message : tn('바꾸지 못했어요'))
    } finally {
      setBusy(false)
    }
  }
  return <VisibilityPicker value={value} onChange={set} disabled={busy} />
}
