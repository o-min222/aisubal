/**
 * Agent handles (0066): `@<handle>.ai`. The handle is a slug of the agent's
 * name (a-z 0-9 _ and Hangul, max 20), made unique in the DB with _2, _3 ….
 * Member handles can't contain '.', so `@x.ai` always means an agent.
 * Keep AGENT_HANDLE_CHARS in sync with agent__handle_base / agent__mentioned_handles.
 */
export const AGENT_HANDLE_CHARS = '0-9a-z_가-힣'

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

/** Bare handle, no leading @ and no .ai suffix. */
export function bareAgentHandle(handle: string | null | undefined): string {
  return String(handle ?? '').replace(/^@/, '').replace(/\.ai$/i, '').trim()
}
