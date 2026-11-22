import { describe, expect, it } from 'vitest'
import { serviceDomain, serviceIconUrl, serviceLogo, letterHue } from '@/lib/service-logos'
import { chipOverflow } from '@/lib/profile-stack'

describe('service logos', () => {
  it('maps common labels (plans, casing, spacing) to the service', () => {
    expect(serviceLogo('ChatGPT Plus')?.key).toBe('chatgpt')
    expect(serviceLogo('claude max')?.key).toBe('claude')
    expect(serviceLogo('Claude Code')?.key).toBe('claude-code')
    expect(serviceLogo('SuperGrok')?.key).toBe('grok')
    expect(serviceLogo('GitHub MCP Server')?.key).toBe('copilot')
    expect(serviceLogo('Gemini Advanced')?.domain).toBe('gemini.google.com')
  })
  it('unknown labels fall back to a letter mark (no URL)', () => {
    expect(serviceLogo('우리 회사 사내봇')).toBeNull()
    expect(serviceIconUrl('우리 회사 사내봇')).toBeNull()
    expect(letterHue('x')).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it('the icon proxy only knows allowlisted keys', () => {
    expect(serviceIconUrl('Cursor Pro')).toBe('/api/icon/cursor')
    expect(serviceDomain('cursor')).toBe('cursor.com')
    expect(serviceDomain('../../etc')).toBeNull()
    expect(serviceDomain('evil.com')).toBeNull()
  })
  it('chips overflow: 6 slots, the last one becomes +N', () => {
    const items = Array.from({ length: 9 }, (_, i) => i)
    expect(chipOverflow(items, 6)).toEqual({ shown: [0, 1, 2, 3, 4], more: 4 })
    expect(chipOverflow(items.slice(0, 6), 6)).toEqual({ shown: [0, 1, 2, 3, 4, 5], more: 0 })
  })
})
