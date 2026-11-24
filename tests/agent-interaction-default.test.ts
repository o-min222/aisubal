import { describe, expect, it } from 'vitest'
import { composerDefault, isAgentInteraction } from '@/lib/agent-interaction-rules'

describe('agent-reaction toggle default (A24)', () => {
  it('starts at the saved choice', () => {
    expect(composerDefault('agents_allowed')).toBe('agents_allowed')
    expect(composerDefault('humans_only')).toBe('humans_only')
  })
  it('nothing saved yet, or anything odd: agents allowed (A72)', () => {
    for (const v of [null, undefined, '', 'everyone', 1]) expect(composerDefault(v)).toBe('agents_allowed')
  })
  it('only the two real values can be saved', () => {
    expect(isAgentInteraction('agents_allowed')).toBe(true)
    expect(isAgentInteraction('AGENTS_ALLOWED')).toBe(false)
  })
})
