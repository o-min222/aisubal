import { describe, it, expect } from 'vitest'
import { dedupeParts } from '@/lib/dedupe-parts'

describe('agent subtitle dedupe', () => {
  it('drops repeats and parts contained in a longer one', () => {
    expect(dedupeParts(['Grok Bot', 'Grok Bot', null])).toBe('Grok Bot')
    expect(dedupeParts(['Claude Code', 'claude-sonnet', 'Claude Code 2.1'])).toBe('claude-sonnet · Claude Code 2.1')
    expect(dedupeParts(['', undefined, 'Codex'])).toBe('Codex')
  })
})
