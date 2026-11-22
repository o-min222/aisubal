import { describe, expect, it } from 'vitest'
import { AGENT_PROFILE_TOOLS, cleanAgentProfileInput, parseAgentProfile, toAgentFacingProfile } from '@/lib/agent-profile'
import { toolAllowed } from '@/lib/mcp-scopes'

const raw = {
  id: '6a6acdb2-beed-4215-9eff-0751babe1594', name: '야간 리서처', model: 'claude-sonnet', client: 'claude_code',
  bio: '써본 것만 적어요', avatarUrl: 'https://x.supabase.co/storage/v1/object/public/avatars/u/a.png', isOwner: false, showOnProfile: true,
  createdAt: '2026-11-01T00:00:00Z', lastActiveAt: '2026-11-22T08:00:00Z',
  pledge: { no: 12, hash: 'abc', signedAt: '2026-11-02T00:00:00Z' },
  owner: { id: 'member-uuid', handle: 'cloud', name: '구름', avatarUrl: 'https://x/o.png' },
  counts: { agoraPosts: 3, replies: 2, likes: 9 },
  recent: [{ kind: 'agora_post', id: 'p1', href: '/agora/p1', snippet: 'hi', toolName: 'Context7', rating: 4, createdAt: '2026-11-22T00:00:00Z' }],
}

describe('agent profiles', () => {
  it('parses the RPC shape and rejects junk', () => {
    const p = parseAgentProfile(raw)!
    expect(p.name).toBe('야간 리서처')
    expect(p.counts).toEqual({ agoraPosts: 3, replies: 2, likes: 9 })
    expect(p.recent[0].href).toBe('/agora/p1')
    expect(parseAgentProfile(null)).toBeNull()
    expect(parseAgentProfile({ id: 'x' })).toBeNull()
  })
  it('validates web edits (null = unchanged, empty bio clears, photo must be a URL)', () => {
    expect(cleanAgentProfileInput({ name: '  봇 ', bio: '' })).toEqual({ ok: true, name: '봇', bio: '', avatar: null })
    // 0062: the model is read-only — a stray model field is ignored, never saved
    expect(cleanAgentProfileInput({ model: ' gpt-5 ' } as never)).toEqual({ ok: true, name: null, bio: null, avatar: null })
    expect(cleanAgentProfileInput({ name: '' })).toEqual({ ok: false, error: 'name' })
    expect(cleanAgentProfileInput({ bio: 'x'.repeat(301) })).toEqual({ ok: false, error: 'bio' })
    expect(cleanAgentProfileInput({ avatarUrl: 'javascript:alert(1)' })).toEqual({ ok: false, error: 'avatar' })
    expect(cleanAgentProfileInput({ avatarUrl: '' })).toMatchObject({ ok: true, avatar: '' })
  })
  it('agents see no member ids or photo URLs, and the bio is marked untrusted', () => {
    const a = toAgentFacingProfile(parseAgentProfile(raw)!, false)
    const json = JSON.stringify(a)
    expect(json).not.toContain('member-uuid')
    expect(json).not.toContain('https://')
    expect(a.untrusted_bio).toBe('써본 것만 적어요')
    expect(a.owner).toEqual({ name: '구름', handle: 'cloud' })
    expect(a.page).toBe('/agents/6a6acdb2-beed-4215-9eff-0751babe1594')
  })
  it('any connected agent can call the profile tools', () => {
    for (const t of AGENT_PROFILE_TOOLS) expect(toolAllowed(t.name, ['archive:read'], false)).toBe(true)
  })
})
