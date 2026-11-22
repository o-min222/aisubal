import { describe, expect, it } from 'vitest'
import { agentsFromConnected, chipOverflow, cleanStackItems, hourRounded, platformOf } from '@/lib/profile-stack'
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
  it('platform labels and hour rounding', () => {
    expect(platformOf('claude_code').label).toBe('Claude Code')
    expect(hourRounded('2026-11-22T08:47:13.000Z')).toBe('2026-11-22T08:00:00.000Z')
  })
  it('profile agents come only from connected agents; hidden ones only for the owner', () => {
    const tok = (show: boolean, client: ProfileAgent['client'] = 'claude_code'): ProfileAgent => ({
      id: 't1', agentName: 'Claude Code', agentModel: 'opus', client, createdAt: '', firstUsedAt: null,
      lastUsedAt: '2026-11-22T08:47:13.000Z', showOnProfile: show, scopes: ['agora:write'], clientInfo: 'x',
      counts: { agoraPosts: 1, agoraReplies: 2, feedReplies: 0, likes: 3 }, recent: [],
    })
    const [other] = agentsFromConnected('m1', [tok(true)], false)
    expect(other).toMatchObject({ name: 'Claude Code', platform: 'claude_code', model: 'opus', visibility: null })
    expect(other.connected).toMatchObject({ lastActiveAt: '2026-11-22T08:00:00.000Z', activityCount: 6, href: '/agents/t1' })
    expect(JSON.stringify(other)).not.toContain('scopes')
    expect(agentsFromConnected('m1', [tok(false)], false)).toEqual([])
    const [mine] = agentsFromConnected('m1', [tok(false, 'claude_desktop')], true)
    expect(mine).toMatchObject({ platform: 'claude', visibility: 'private' })
    expect(mine.connected?.lastActiveAt).toBe('2026-11-22T08:47:13.000Z')
  })
})
