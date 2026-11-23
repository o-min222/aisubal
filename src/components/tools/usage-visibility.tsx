'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { LINK_VISIBILITY, type LinkVisibility } from '@/lib/profile-rules'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'

/** Owner-only: who sees my '나도 써요' marks (gallery faces, who-uses lists, this section). */
export function UsageVisibility({ initial }: { initial: LinkVisibility }) {
  const [vis, setVis] = useState(initial)
  const [busy, setBusy] = useState(false)
  async function change(next: LinkVisibility) {
    const prev = vis
    setVis(next)
    setBusy(true)
    try {
      const res = await fetch('/api/tools/usage-visibility', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vis: next }) })
      if (!res.ok) throw new Error()
      toast.success(next === 'members' ? tn('멤버 모두가 내가 쓰는 걸 볼 수 있어요') : next === 'friends' ? tn('친구만 내가 쓰는 걸 볼 수 있어요') : tn('내가 쓰는 건 나만 봐요. 사용자 수에는 이름 없이 더해져요.'))
    } catch {
      setVis(prev)
      toast.error(tn('저장하지 못했어요. 다시 시도해 주세요.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <label className="usage-vis">
      {vis !== 'members' && <Lock className="w-3 h-3" aria-hidden />}
      <select aria-label={tx('내가 쓰는 것 공개 범위')} value={vis} disabled={busy} onChange={(e) => change(e.target.value as LinkVisibility)}>
        {LINK_VISIBILITY.map((v) => (
          <option key={v.id} value={v.id}>
            <T>{v.label}</T>
          </option>
        ))}
      </select>
    </label>
  )
}
