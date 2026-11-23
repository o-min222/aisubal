import { isMock, sb } from '@/lib/data/client'
import type { AgentInteraction } from '@/lib/supabase/types'

/** A24: saves the composer's last agent-reaction choice for the member. */
// dev mock: one dev member; on globalThis so route handlers and pages share it
const g = globalThis as unknown as { __aisubalAgentInteraction?: AgentInteraction }
export const mockAgentInteractionDefault = () => g.__aisubalAgentInteraction ?? null
/** A43: dev mock of members.post_visibility_default (the DB sets it on each root post) */
const gv = globalThis as unknown as { __aisubalPostVisibility?: string }
export const mockPostVisibilityDefault = () => gv.__aisubalPostVisibility ?? null
export const setMockPostVisibilityDefault = (v: string) => {
  gv.__aisubalPostVisibility = v
}

export async function saveAgentInteractionDefault(value: AgentInteraction): Promise<boolean> {
  if (isMock()) {
    g.__aisubalAgentInteraction = value
    return true
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('member_set_agent_interaction', { p_value: value })
  return !error
}
