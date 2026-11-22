import { describe, expect, it } from 'vitest'
import { chipOverflow, cleanStackItems, hourRounded, matchConnected, platformOf, validateAgents } from '@/lib/profile-stack'
import { mergeAgents } from '@/lib/data/profile-stack'
import type { ProfileAgent } from '@/lib/data/tokens'

describe('profile stack rules', () => {
  it('folds overflow into +N', () => {
    expect(chipOverflow([1, 2, 3], 4)).toEqual({ shown: [1, 2, 3], more: 0 })
    expect(chipOverflow([1, 2, 3, 4, 5, 6], 4)).toEqual({ shown: [1, 2, 3], more: 3 })
  })
  it('cleans and de-duplicates items case/space-insensitively', () => {
    const out = cleanStackItems([{ label: ' Claude ' }, { label: 'claude' }, { label: '' }, { label: 'Chat GPT' }, { label: 'chatgpt' }])
    expect(out.map((i) => i.label)).toEqual(['Claude', 'Chat GPT'])
    expect(cleanStackItems(Array.from({ length: 30 }, (_, i) => ({ label: `x${i}` }))).length).toBe(20)
  })
  it('validates agents: https links only, unknown platform → other, limit 12', () => {
    expect(validateAgents([{ name: 'a', url: 'http://x.com' }]).ok).toBe(false)
    expect(validateAgents([{ name: '' }]).ok).toBe(false)
    expect(validateAgents(Array.from({ length: 13 }, () => ({ name: 'a' }))).ok).toBe(false)
    const v = validateAgents([{ name: 'Bot', platform: 'nope', visibility: 'weird', url: 'https://x.com/a' }])
    expect(v.ok && v.agents[0]).toMatchObject({ platform: 'other', visibility: 'members', url: 'https://x.com/a' })
    expect(platformOf('claude_code').label).toBe('Claude Code')
  })
  it('matches connected agents by normalized name and rounds to the hour', () => {
    expect(matchConnected('Claude-Code', [{ agentName: 'claude code' }])).toBeTruthy()
    expect(matchConnected('Other', [{ agentName: 'claude code' }])).toBeNull()
    expect(hourRounded('2026-11-22T08:47:13.000Z')).toBe('2026-11-22T08:00:00.000Z')
  })
  it('merges activity; hidden token agents never match for other viewers', () => {
    const tok = (show: boolean): ProfileAgent => ({
      id: 't1', agentName: 'Claude Code', agentModel: 'opus', client: null, createdAt: '', firstUsedAt: null,
      lastUsedAt: '2026-11-22T08:47:13.000Z', showOnProfile: show, scopes: null, clientInfo: null,
      counts: { agoraPosts: 1, agoraReplies: 2, feedReplies: 0, likes: 3 }, recent: [],
    })
    const manual = [{ id: 'a1', name: 'claude code', platform: 'claude_code' as const, model: '', role: '', url: '', visibility: null }]
    const other = mergeAgents('m1', manual, [tok(true)], false)[0]
    expect(other.connected).toMatchObject({ lastActiveAt: '2026-11-22T08:00:00.000Z', activityCount: 6, href: '/members/m1#agents' })
    expect(other.model).toBe('opus')
    expect(JSON.stringify(other)).not.toContain('scopes')
    expect(mergeAgents('m1', manual, [tok(false)], false)[0].connected).toBeNull()
    expect(mergeAgents('m1', manual, [tok(false)], true)[0].connected?.lastActiveAt).toBe('2026-11-22T08:47:13.000Z')
  })
})
