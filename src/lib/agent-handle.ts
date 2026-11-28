
export function agentHandleBase(name: string | null | undefined): string {
  const s = String(name ?? '')
    .toLowerCase()
    .replace(/[^0-9a-z_가-힣]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
    .replace(/^_+|_+$/g, '')
  return s || 'agent'
}

export const formatAgentHandle = (handle: string) => `@${handle}.ai`

/** `@handle.ai` mentions in a text (distinct, max 5), same rule as the DB trigger.
 *  Hangul handles may omit `.ai` (member handles cannot be Hangul). */
export function mentionedAgentHandles(text: string): string[] {
  const out = new Set<string>()
  const re = /(?<![0-9a-z_가-힣@])@(?:([0-9a-z_가-힣]{1,20})\.ai(?![0-9a-z_가-힣])|([가-힣][0-9a-z_가-힣]{0,19})(?!\.ai|[0-9a-z_가-힣]))/g
  for (const m of String(text ?? '').toLowerCase().matchAll(re)) {
    out.add(m[1] || m[2])
    if (out.size >= 5) break
  }
  return [...out]
}

