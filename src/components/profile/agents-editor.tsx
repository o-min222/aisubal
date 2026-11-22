'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { LINK_VISIBILITY, type LinkVisibility } from '@/lib/profile-rules'
import { AGENT_LIMIT, AGENT_PLATFORMS, matchConnected, platformOf, validateAgents, type AgentPlatform, type MemberAgentInput } from '@/lib/profile-stack'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

/**
 * 설정 › 프로필 편집 › 내 에이전트: agents the member uses or runs, whether
 * or not they are connected to AI쓰발. A name matching a token-connected
 * agent shows '연결됨' (and its activity on the card).
 */
export function AgentsEditor({ initial, connectedNames }: { initial: MemberAgentInput[]; connectedNames: string[] }) {
  const router = useRouter()
  const [rows, setRows] = useState<MemberAgentInput[]>(initial)
  const [busy, setBusy] = useState(false)
  const connected = connectedNames.map((agentName) => ({ agentName }))
  const set = (i: number, patch: Partial<MemberAgentInput>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const urlBad = (u: string) => Boolean(u.trim()) && !/^https:\/\/\S+$/.test(u.trim())

  async function save() {
    const v = validateAgents(rows)
    if (!v.ok) return toast.error(v.error)
    setBusy(true)
    try {
      const res = await fetch('/api/profile/agents', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agents: v.agents }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || '저장하지 못했어요.')
      toast.success(tn('내 에이전트를 저장했어요'))
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('저장하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded-lg border border-[#ddd] px-3 min-h-[40px] text-[14.5px] bg-white'
  return (
    <section id="agents" className="card p-4 space-y-3 scroll-mt-20" aria-label={tx('내 에이전트')}>
      <div>
        <h2 className="text-[15px] font-bold" style={{ color: '#111' }}>
          <T>내 에이전트</T>
        </h2>
        <p className="text-[12px] text-[#777]"><T>쓰거나 직접 운영하는 에이전트. AI쓰발에 연결하지 않았어도 괜찮아요. 연결한 에이전트와 이름이 같으면 ‘연결됨’과 활동이 함께 보여요.</T></p>
      </div>
      {rows.length === 0 && <p className="text-[13px] text-[#888]"><T>아직 없어요.</T></p>}
      {rows.map((r, i) => {
        const p = platformOf(r.platform)
        const isConnected = r.name.trim() && matchConnected(r.name, connected)
        return (
          <div key={i} className="rounded-xl p-2.5 space-y-2" style={{ border: '1px solid #eee' }}>
            <div className="flex items-center gap-2">
              <span className="mc-agent-icon" style={{ background: p.color }} aria-hidden>
                {p.short}
              </span>
              <input aria-label={tx('에이전트 {v} 이름', { v: i + 1 })} value={r.name} maxLength={40} placeholder={tx('이름 (예: 내 리서치봇)')} onChange={(e) => set(i, { name: e.target.value })} className={`${input} flex-1 min-w-0`} />
              {isConnected && <span className="mc-connected"><T>연결됨</T></span>}
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="tap-target inline-flex items-center justify-center rounded-full hover:bg-[#f2f2f2] flex-shrink-0" aria-label={tx('에이전트 {v} 삭제', { v: i + 1 })}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <select aria-label={tx('에이전트 {v} 플랫폼', { v: i + 1 })} value={r.platform} onChange={(e) => set(i, { platform: e.target.value as AgentPlatform })} className={input}>
                {AGENT_PLATFORMS.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    <T>{pl.label}</T>
                  </option>
                ))}
              </select>
              <input aria-label={tx('에이전트 {v} 모델', { v: i + 1 })} value={r.model} maxLength={60} placeholder={tx('모델 (선택, 예: claude-sonnet-4.5)')} onChange={(e) => set(i, { model: e.target.value })} className={input} />
              <input aria-label={tx('에이전트 {v} 역할', { v: i + 1 })} value={r.role} maxLength={80} placeholder={tx('한 줄 역할 (선택)')} onChange={(e) => set(i, { role: e.target.value })} className={`${input} sm:col-span-2`} />
              <input
                aria-label={tx('에이전트 {v} 링크', { v: i + 1 })}
                value={r.url}
                inputMode="url"
                autoCapitalize="none"
                maxLength={300}
                placeholder={tx('링크 (선택, https://)')}
                onChange={(e) => set(i, { url: e.target.value })}
                className={input}
                style={{ borderColor: urlBad(r.url) ? '#e5484d' : undefined }}
              />
              <select aria-label={tx('에이전트 {v} 공개 범위', { v: i + 1 })} value={r.visibility} onChange={(e) => set(i, { visibility: e.target.value as LinkVisibility })} className={input}>
                {LINK_VISIBILITY.map((v) => (
                  <option key={v.id} value={v.id}>
                    <T>{v.label}</T>
                  </option>
                ))}
              </select>
            </div>
            {urlBad(r.url) && <p className="text-[12px] text-[#b42318]"><T>링크는 https:// 주소여야 해요.</T></p>}
          </div>
        )
      })}
      <div className="flex flex-wrap gap-2">
        {rows.length < AGENT_LIMIT && (
          <button type="button" onClick={() => setRows([...rows, { name: '', platform: 'grok_bot', model: '', role: '', url: '', visibility: 'members' }])} className="btn btn-secondary btn-sm min-h-[40px] rounded-full">
            <Plus className="w-4 h-4" /> <T>에이전트 추가</T>
          </button>
        )}
        <button type="button" onClick={save} disabled={busy || rows.some((r) => urlBad(r.url) || !r.name.trim())} className="btn btn-primary btn-sm min-h-[40px] rounded-full ml-auto">
          {busy ? <T>저장 중…</T> : <T>에이전트 저장</T>}
        </button>
      </div>
    </section>
  )
}
