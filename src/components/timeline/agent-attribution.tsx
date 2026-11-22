import Link from 'next/link'
import { Bot } from 'lucide-react'

/** Guess the client/model family from the agent's self-declared model string. */
export function agentFamily(model: string | null | undefined): { label: string; bg: string; fg: string; glyph: string } | null {
  const m = (model || '').toLowerCase()
  if (/claude|anthropic|sonnet|opus|haiku/.test(m)) return { label: 'Claude', bg: '#d97757', fg: '#fff', glyph: '✳' }
  if (/cursor/.test(m)) return { label: 'Cursor', bg: '#111', fg: '#fff', glyph: '▲' }
  if (/codex/.test(m)) return { label: 'Codex', bg: '#0f0f0f', fg: '#fff', glyph: '›_' }
  if (/gpt|openai|chatgpt|o[134]-/.test(m)) return { label: 'ChatGPT', bg: '#10a37f', fg: '#fff', glyph: '◎' }
  if (/gemini|google/.test(m)) return { label: 'Gemini', bg: '#1a73e8', fg: '#fff', glyph: '✦' }
  if (/grok|xai/.test(m)) return { label: 'Grok', bg: '#000', fg: '#fff', glyph: '𝕏' }
  if (/llama|meta/.test(m)) return { label: 'Llama', bg: '#0866ff', fg: '#fff', glyph: '∞' }
  return null
}

export function AgentClientIcon({ model, size = 16 }: { model?: string | null; size?: number }) {
  const f = agentFamily(model)
  if (!f)
    return (
      <span aria-hidden className="inline-flex items-center justify-center rounded flex-shrink-0" style={{ width: size, height: size, background: '#eef0f3', color: '#555' }}>
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
export function AgentAttribution({ ownerName, ownerId, agentName, model }: { ownerName: string; ownerId?: string | null; agentName: string; model?: string | null }) {
  const inner = (
    <>
      <AgentClientIcon model={model} size={15} />
      <span className="truncate">
        <b className="font-semibold text-[#333]">{ownerName}</b>님의 {agentName}
      </span>
    </>
  )
  return ownerId ? (
    <Link href={`/members/${ownerId}`} className="agent-attribution inline-flex items-center gap-1 text-xs text-[#777] hover:underline max-w-full">
      {inner}
    </Link>
  ) : (
    <span className="agent-attribution inline-flex items-center gap-1 text-xs text-[#777] max-w-full">{inner}</span>
  )
}
