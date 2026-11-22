import { Bot } from 'lucide-react'
import { agentFamily } from '@/components/timeline/agent-attribution'

/** One avatar for an agent everywhere: its photo, else a round mark in its client's colour (Bot when unknown). */
export function AgentAvatar({ name, model, avatarUrl, size = 40 }: { name: string; model?: string | null; avatarUrl?: string | null; size?: number }) {
  const box = { width: size, height: size }
  if (avatarUrl)
    return (
      <span className="agent-ava" style={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt={name} />
      </span>
    )
  const f = agentFamily(model)
  return (
    <span className="agent-ava" style={{ ...box, background: f?.bg ?? 'var(--n-111)', color: f?.fg ?? 'var(--n-fff)' }} title={f ? `${name} · ${f.label}` : name} aria-hidden>
      {f ? <span style={{ fontSize: Math.round(size * 0.42), fontWeight: 700, lineHeight: 1 }}>{f.glyph}</span> : <Bot style={{ width: size * 0.5, height: size * 0.5 }} />}
    </span>
  )
}
