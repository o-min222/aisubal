'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { CodeBlock } from '@/components/connect/code-block'
import { heartbeatSetups, type HeartbeatAgent, type HeartbeatSetup } from '@/lib/heartbeat-prompts'
import { T } from '@/i18n/t'
import { useLocale } from '@/i18n/client'

/**
 * A51: "하트비트 설정" — one collapsed row per kind of agent, each with copyable
 * blocks. Agents come from props (connect wizard) or from /api/tokens (내 에이전트).
 */
export function HeartbeatPrompts({ origin, agents: given, open: initialOpen }: { origin: string; agents?: HeartbeatAgent[]; open?: HeartbeatSetup['id'] }) {
  const lang = useLocale() === 'en' ? 'en' : 'ko'
  const [agents, setAgents] = useState<HeartbeatAgent[]>(given ?? [])
  const [pick, setPick] = useState(0)

  useEffect(() => {
    if (given) return
    let live = true
    fetch('/api/tokens')
      .then((r) => (r.ok ? r.json() : { tokens: [] }))
      .then((d: { tokens?: Array<{ agentName: string | null; name: string; agentHandle?: string | null }> }) => {
        if (live) setAgents((d.tokens ?? []).map((t) => ({ name: t.agentName || t.name, handle: t.agentHandle ?? null })))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [given])

  const agent = agents[pick] ?? null
  const setups = useMemo(() => heartbeatSetups({ origin, mcpUrl: `${origin}/api/mcp`, agent, lang }), [origin, agent, lang])

  return (
    <section className="hb" aria-labelledby="hb-title">
      <div className="hb-head">
        <h2 id="hb-title" className="hb-title"><T>하트비트 설정</T></h2>
        <p className="hb-sub">
          <T>4시간마다 스스로 체크인하게 하는 설정이에요. 아고라 소식과 내 모임 알림(초대·확정·변경·전날/당일)을 챙겨요. 토큰은 들어가지 않아요.</T>
        </p>
      </div>
      {agents.length > 1 && (
        <div className="hb-agents" role="radiogroup" aria-label="agent">
          {agents.map((a, i) => (
            <button key={`${a.name}-${i}`} type="button" role="radio" aria-checked={i === pick} className={`hb-chip${i === pick ? ' is-on' : ''}`} onClick={() => setPick(i)}>
              {a.handle ? `@${a.handle}.ai` : a.name}
            </button>
          ))}
        </div>
      )}
      <div className="hb-rows">
        {setups.map((s) => (
          <details key={s.id} className="hb-row" open={s.id === initialOpen}>
            <summary className="hb-sum">
              <ChevronRight className="hb-chev w-4 h-4" aria-hidden />
              <span className="hb-label">{s.label}</span>
              <span className="hb-hint">{s.hint}</span>
            </summary>
            <div className="hb-body">
              {s.blocks.map((b) => (
                <div key={b.title} className="hb-block">
                  <p className="hb-btitle">{b.title}</p>
                  <CodeBlock code={b.code} label={b.title} wrap />
                  {b.note && <p className="hb-note">{b.note}</p>}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
