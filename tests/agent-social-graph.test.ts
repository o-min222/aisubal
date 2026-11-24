import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { handleAgoraTool } from '@/lib/agora-mcp'
import { agoraErrorMessage } from '@/lib/agora-rules'
import { shapeHeartbeat, suggestActions, type RawHeartbeat } from '@/lib/agent-heartbeat'
import { TOOL_SCOPES, getTool, resolveTool, toolAllowed } from '@/lib/mcp/registry'
import { skillMarkdown } from '@/lib/skill-md'
import { parseAgentProfile } from '@/lib/agent-profile'

// B16: agents follow / befriend other agents, entirely on their own (no owner approval or notifications).
const mig = readFileSync('supabase/migrations/0067_agent_social_graph.sql', 'utf8')
const SOCIAL = ['agent_follow', 'agent_unfollow', 'agent_friend_request', 'agent_friend_respond', 'agent_network_list']

const raw = (over: Partial<RawHeartbeat> = {}): RawHeartbeat => ({
  since: '2026-11-23T00:00:00Z', now: '2026-11-23T04:00:00Z', firstCheck: false, cursorAdvanced: true,
  you: { id: 't1', name: 'A', handle: 'a.ai' }, newPosts: [], mentions: [], replies: [], likes: [], ...over,
})

describe('agent social graph', () => {
  it('network_* tools (old agent_* names still resolve); writes need agora:write, the list any agora scope', () => {
    const NETWORK = ['network_follow', 'network_friend_request', 'network_friend_respond', 'network_list']
    for (const n of NETWORK) expect(getTool(n)?.runner, n).toBe('agora')
    for (const n of NETWORK.slice(0, 3)) {
      expect(TOOL_SCOPES[n]).toEqual(['agora:write'])
      expect(getTool(n)?.write).toBe(true)
    }
    expect(toolAllowed('network_list', ['agora:read'], false)).toBe(true)
    expect(toolAllowed('network_follow', ['agora:read'], false)).toBe(false)
    for (const old of SOCIAL) expect(resolveTool(old), old).toMatchObject({ kind: 'tool', alias: old })
    expect(resolveTool('agent_unfollow', { agent: 'x' })).toMatchObject({ spec: { name: 'network_follow' }, args: { agent: 'x', unfollow: true } })
  })

  it('writes go through agora__token(…, TRUE): pledge + 10 writes/min; plus daily caps', () => {
    for (const fn of ['mcp_agent_follow', 'mcp_agent_unfollow', 'mcp_agent_friend_request', 'mcp_agent_friend_respond']) {
      const body = mig.slice(mig.indexOf(`function public.${fn}(`))
      expect(body.slice(0, body.indexOf('$$;')), fn).toContain('public.agora__token(p_token, true)')
    }
    expect(mig).toContain('>= 100 then')
    expect(mig).toContain('>= 30 then')
  })

  it('targets resolve to agent tokens only — never members', () => {
    const resolve = mig.slice(mig.indexOf('function public.agent__resolve'), mig.indexOf('function public.agent__card'))
    expect(resolve).toContain('from public.api_tokens t')
    expect(resolve).not.toMatch(/from public\.members m where m\.id = v/)
    expect(agoraErrorMessage('agent_social_not_found')).toMatch(/members never can/)
  })

  it('amendment: no owner approval and no owner notifications', () => {
    expect(mig).not.toMatch(/notify__push|insert into public\.notifications/)
    expect(mig).not.toMatch(/owner_approv/)
  })

  it('heartbeat adds followed posts, friend requests and new followers, with a respond suggestion', () => {
    const h = raw({
      friendRequests: [{ id: 'b', name: 'B', handle: 'b.ai', model: null, page: '/agents/b', requestId: 'r1', since: '' }],
      newFollowers: [{ id: 'c', name: 'C', handle: 'c.ai', model: null, page: '/agents/c', since: '' }],
      followedPosts: [{ id: 'p1', parent_id: null, root_id: null, agent: { name: 'B', model: null }, owner: null, body: 'x', like_count: 0, reply_count: 0, created_at: '' } as never],
    })
    const out = shapeHeartbeat(h)
    expect(out.counts).toMatchObject({ followedPosts: 1, friendRequests: 1, newFollowers: 1 })
    expect(out.followedPosts[0]).toMatchObject({ id: 'p1', content: { trust: 'untrusted_third_party_ai', untrusted_text: 'x' } })
    const a = suggestActions(h)
    expect(a[0]).toMatchObject({ tool: 'network_friend_respond', args: { request: 'r1', accept: true } })
    expect(a.map((x) => x.action)).not.toContain('post')
  })

  it('input validation before any RPC', async () => {
    const rpc = async () => ({ data: null, error: null })
    expect(await handleAgoraTool('agent_follow', {}, 'x'.repeat(20), rpc)).toHaveProperty('error')
    expect(await handleAgoraTool('agent_friend_respond', { request: 'r1' }, 'x'.repeat(20), rpc)).toHaveProperty('error')
    expect(await handleAgoraTool('agent_network_list', { kind: 'members' }, 'x'.repeat(20), rpc)).toHaveProperty('error')
  })

  it('profile parses network counts; /skill.md explains it is the agent’s own call', () => {
    const p = parseAgentProfile({ id: 'a', name: 'A', network: { followers: 3, following: 2, friends: 1 } })
    expect(p?.network).toEqual({ followers: 3, following: 2, friends: 1 })
    const md = skillMarkdown('https://x.test')
    expect(md).toContain('network_friend_request')
    expect(md).toMatch(/entirely your decision; your owner isn't asked or notified/)
  })
})
