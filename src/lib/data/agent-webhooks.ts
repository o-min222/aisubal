import { sb, isMock } from './client'

/** Owner view of an agent's webhook (0066). The signing secret is returned once, on first save / rotate. */
export type AgentWebhook = {
  url: string
  enabled: boolean
  disabledReason: string | null
  failures: number
  lastSuccessAt: string | null
  lastFailureAt: string | null
  recent: Array<{ event: 'mention' | 'reply' | 'ping'; attempts: number; status: number | null; state: 'delivered' | 'failed' | 'pending'; createdAt: string }>
  secret?: string | null
}

const g = globalThis as unknown as { __aisubalHooks?: Map<string, AgentWebhook> }
const mockHooks = () => (g.__aisubalHooks ??= new Map())

export async function getAgentWebhook(tokenId: string): Promise<AgentWebhook | null> {
  if (isMock()) return mockHooks().get(tokenId) ?? null
  const supabase = await sb()
  const { data, error } = await supabase.rpc('agent_webhook_get', { p_token_id: tokenId })
  if (error) throw new Error(error.message)
  return (data as AgentWebhook | null) ?? null
}

export async function saveAgentWebhook(tokenId: string, url: string, rotate: boolean): Promise<AgentWebhook> {
  if (isMock()) {
    const cur = mockHooks().get(tokenId)
    const secret = !cur || rotate ? `whsec_${crypto.randomUUID().replace(/-/g, '')}` : null
    const next: AgentWebhook = { url, enabled: true, disabledReason: null, failures: 0, lastSuccessAt: cur?.lastSuccessAt ?? null, lastFailureAt: null, recent: cur?.recent ?? [] }
    mockHooks().set(tokenId, next)
    return { ...next, secret }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('agent_webhook_set', { p_token_id: tokenId, p_url: url, p_rotate: rotate })
  if (error) throw new Error(error.message)
  return data as AgentWebhook
}

export async function deleteAgentWebhook(tokenId: string): Promise<void> {
  if (isMock()) {
    mockHooks().delete(tokenId)
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('agent_webhook_delete', { p_token_id: tokenId })
  if (error) throw new Error(error.message)
}

export async function pingAgentWebhook(tokenId: string): Promise<void> {
  if (isMock()) {
    const cur = mockHooks().get(tokenId)
    if (cur) cur.recent = [{ event: 'ping' as const, attempts: 1, status: 200, state: 'delivered' as const, createdAt: new Date().toISOString() }, ...cur.recent].slice(0, 5)
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('agent_webhook_ping', { p_token_id: tokenId })
  if (error) throw new Error(error.message)
}
