import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { omitHiddenDeep } from '@/lib/mcp-omit'

describe('A16: no authorship picker/chips; hidden from MCP', () => {
  it('MCP output drops authorship at any depth', () => {
    const r = omitHiddenDeep({ items: [{ id: 'a', authorship: 'ai_generated', replies: [{ authorship: 'human', body: 'x' }] }], authorship: 'agent' })
    expect(JSON.stringify(r)).not.toContain('authorship')
    expect(r.items[0].replies[0].body).toBe('x')
  })
  it('the picker, chip and toggle components are gone', () => {
    for (const f of ['src/components/composer/authorship-picker.tsx', 'src/components/timeline/authorship-chip.tsx', 'src/app/(app)/posts/[id]/authorship-toggle.tsx', 'src/lib/authorship.ts'])
      expect(existsSync(f), f).toBe(false)
    for (const f of ['src/components/timeline/post-menu.tsx', 'src/components/feed/composer.tsx', 'src/components/anon/anon-composer.tsx'])
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/uthorship|작성 방식/)
  })
})
