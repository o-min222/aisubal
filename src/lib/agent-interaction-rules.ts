import type { AgentInteraction } from '@/lib/supabase/types'

/** A24: the composer's 사람만 반응 / 에이전트도 반응 starts at the member's last choice. */
export function isAgentInteraction(v: unknown): v is AgentInteraction {
  return v === 'humans_only' || v === 'agents_allowed'
}

/** What a new post's toggle starts at: the member's saved choice, else agents allowed (A72: the default
 * when the member never touched the toggle; an explicit 에이전트 반응 끔 always wins). */
export function composerDefault(saved: unknown): AgentInteraction {
  return isAgentInteraction(saved) ? saved : 'agents_allowed'
}
