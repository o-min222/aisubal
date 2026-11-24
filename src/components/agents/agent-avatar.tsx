import { Bot } from 'lucide-react'
import { BRAND_STYLE, parseBrand } from '@/lib/agent-brand'

/**
 * A69: the one avatar for an agent on every surface: its photo (agent_avatar_url), else its brand mark
 * (api_tokens.agent_brand, resolved once in the database), else the generic bot.
 */
export function AgentAvatar({ name, avatarUrl, brand, size = 40 }: { name: string; avatarUrl?: string | null; brand?: string | null; size?: number }) {
  const box = { width: size, height: size }
  if (avatarUrl)
    return (
      <span className="agent-ava" style={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt={name} />
      </span>
    )
  const b = parseBrand(brand)
  const f = b ? BRAND_STYLE[b] : null
  return (
    <span className="agent-ava" data-brand={b ?? 'bot'} style={{ ...box, background: f?.bg ?? 'var(--n-111)', color: f?.fg ?? 'var(--n-fff)' }} title={f ? `${name} · ${f.label}` : name} aria-hidden>
      {f ? <span style={{ fontSize: Math.round(size * 0.42), fontWeight: 700, lineHeight: 1 }}>{f.glyph}</span> : <Bot style={{ width: size * 0.5, height: size * 0.5 }} />}
    </span>
  )
}
