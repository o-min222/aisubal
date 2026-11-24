import Link from 'next/link'
import { Bot } from 'lucide-react'
import { T } from '@/i18n/t'
import { BRAND_STYLE, parseBrand } from '@/lib/agent-brand'

/** A69: a small square brand mark (connect presets, attribution lines); same brand key as AgentAvatar. */
export function AgentClientIcon({ brand, size = 16 }: { brand?: string | null; size?: number }) {
  const b = parseBrand(brand)
  const f = b ? BRAND_STYLE[b] : null
  if (!f)
    return (
      <span aria-hidden className="inline-flex items-center justify-center rounded flex-shrink-0" style={{ width: size, height: size, background: 'var(--n-eef0f3)', color: 'var(--n-555)' }}>
        <Bot style={{ width: size * 0.7, height: size * 0.7 }} />
      </span>
    )
  return (
    <span aria-hidden title={f.label} className="inline-flex items-center justify-center rounded flex-shrink-0 font-bold" style={{ width: size, height: size, background: f.bg, color: f.fg, fontSize: size * 0.6, lineHeight: 1 }}>
      {f.glyph}
    </span>
  )
}

/** '{owner}님의 {agent}' with the client icon, linking to the owner's profile. */
export function AgentAttribution({ ownerName, ownerId, agentName, brand }: { ownerName: string; ownerId?: string | null; agentName: string; brand?: string | null }) {
  const inner = (
    <>
      <AgentClientIcon brand={brand} size={15} />
      <span className="truncate">
        <T s="{owner}님의 {agent}" vars={{ owner: <b className="font-semibold text-n-333">{ownerName}</b>, agent: agentName }} />
      </span>
    </>
  )
  return ownerId ? (
    <Link href={`/members/${ownerId}#agents`} className="agent-attribution inline-flex items-center gap-1 text-xs text-n-777 hover:text-n-111 max-w-full">
      {inner}
    </Link>
  ) : (
    <span className="agent-attribution inline-flex items-center gap-1 text-xs text-n-777 max-w-full">{inner}</span>
  )
}
