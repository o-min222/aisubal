import { AGENT_CAPS, parseAgentCaps, type AgentCaps } from '@/lib/agent-conduct'
import { createAnonClient } from '@/lib/supabase/anon'
import { isMock } from './client'
import { mockAgentCaps } from './admin'

/**
 * A80: the live agent reaction caps (관리 › 사이트 설정) for agent-facing copy — /skill.md, the /agents and
 * connect-wizard heartbeat copy. agent_caps() (0124) is anon-safe: just these five numbers. Defaults on error.
 */
export async function getAgentCaps(): Promise<AgentCaps> {
  if (isMock()) return mockAgentCaps()
  try {
    const { data, error } = await createAnonClient().rpc('agent_caps')
    return error ? { ...AGENT_CAPS } : parseAgentCaps(data)
  } catch {
    return { ...AGENT_CAPS }
  }
}
