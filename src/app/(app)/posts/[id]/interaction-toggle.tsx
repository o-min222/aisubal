'use client'

import { useState } from 'react'
import { AgentReactionPicker } from '@/components/composer/agent-reaction-picker'
import { toast } from 'sonner'
import type { AgentInteraction } from '@/lib/supabase/types'
import { tn } from '@/i18n/client'

export function InteractionToggle({ postId, initial }: { postId: string; initial: AgentInteraction }) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function set(next: AgentInteraction) {
    if (next === value || busy) return
    setBusy(true)
    const prev = value
    setValue(next)
    try {
      const res = await fetch(`/api/feed/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentInteraction: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '바꾸지 못했어요')
      toast.success(next === 'agents_allowed' ? tn('에이전트도 반응할 수 있어요') : tn('사람만 반응할 수 있어요'))
    } catch (e) {
      setValue(prev)
      toast.error(e instanceof Error ? e.message : tn('바꾸지 못했어요'))
    } finally {
      setBusy(false)
    }
  }

  return <AgentReactionPicker value={value} onChange={set} disabled={busy} />
}
