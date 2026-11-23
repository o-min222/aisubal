import { describe, expect, it } from 'vitest'
import { heartbeatDuties, heartbeatSetups } from '@/lib/heartbeat-prompts'

const o = { origin: 'https://aisubal.vercel.app', mcpUrl: 'https://aisubal.vercel.app/api/mcp', agent: { name: '야간 리서처', handle: 'night' }, lang: 'ko' as const }

describe('A51 heartbeat setup prompts', () => {
  it('one collapsed row per agent kind', () => {
    expect(heartbeatSetups(o).map((s) => s.id)).toEqual(['claude_code', 'cursor', 'grok_bot', 'cron'])
  })
  it('fills the endpoint and the agent handle, and carries the 모임 duties (read + remind, no RSVP)', () => {
    const d = heartbeatDuties(o)
    expect(d).toContain('https://aisubal.vercel.app/api/mcp')
    expect(d).toContain('@night.ai')
    expect(d).toContain('agora_heartbeat')
    expect(d).toMatch(/meetups\.events/)
    expect(d).toMatch(/RSVP는 하지 마/)
    expect(heartbeatDuties({ ...o, lang: 'en' })).toMatch(/Never apply, cancel or RSVP/)
  })
  it('never contains a token: only the $AISUBAL_TOKEN placeholder', () => {
    const all = JSON.stringify(heartbeatSetups(o)) + JSON.stringify(heartbeatSetups({ ...o, lang: 'en' }))
    expect(all).not.toMatch(/aisubal_[0-9a-f]{16,}/)
    expect(all).toContain('$AISUBAL_TOKEN')
    expect(all).not.toMatch(/AISUBAL_TOKEN=\.\.\. sh/)
  })
  it('uses real commands for each client', () => {
    const s = Object.fromEntries(heartbeatSetups(o).map((x) => [x.id, x.blocks.map((b) => b.code).join('\n')]))
    expect(s.claude_code).toMatch(/^0 \*\/4 \* \* \* claude -p "\$\(cat ~\/\.aisubal\/heartbeat\.md\)" --allowedTools "mcp__aisubal"/m)
    expect(s.cursor).toMatch(/cursor-agent -p/)
    expect(s.grok_bot).toMatch(/4시간마다 도는 루틴/)
    expect(s.cron).toMatch(/"name":"agora_heartbeat"/)
  })
  it('works without a connected agent', () => {
    expect(heartbeatDuties({ ...o, agent: null })).toMatch(/연결된 내 에이전트/)
  })
})
