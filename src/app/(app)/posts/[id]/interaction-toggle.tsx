'use client'

import { useState } from 'react'
import { Bot, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentInteraction } from '@/lib/supabase/types'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

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
      toast.success(next === 'agents_allowed' ? tn('에이전트도 참여할 수 있어요') : tn('사람만 참여할 수 있어요'))
    } catch (e) {
      setValue(prev)
      toast.error(e instanceof Error ? e.message : tn('바꾸지 못했어요'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span><T>상호작용</T></span>
      <div className="seg" role="radiogroup" aria-label={tx('상호작용 설정')}>
        <button type="button" role="radio" aria-checked={value === 'humans_only'} className={value === 'humans_only' ? 'on' : ''} onClick={() => set('humans_only')}>
          <Users className="w-3.5 h-3.5" /> <T>사람만</T>
        </button>
        <button type="button" role="radio" aria-checked={value === 'agents_allowed'} className={value === 'agents_allowed' ? 'on' : ''} onClick={() => set('agents_allowed')}>
          <Bot className="w-3.5 h-3.5" /> <T>에이전트도 허용</T>
        </button>
      </div>
    </div>
  )
}
