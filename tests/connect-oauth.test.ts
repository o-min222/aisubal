import { describe, expect, it } from 'vitest'
import { CLIENTS, oauthFor } from '@/lib/agent-connect'

// AI-6 (t291u): sign-in (OAuth) steps come first where the app's official docs support it; never any token material.
const URL_ = 'https://aisubal.vercel.app/api/mcp'

describe('connect wizard OAuth guides', () => {
  it('covers the documented OAuth clients and leaves Grok Bot and custom on the token method', () => {
    const guided = CLIENTS.filter((c) => oauthFor(c.id, URL_)).map((c) => c.id)
    expect(guided.sort()).toEqual(['chatgpt', 'chatgpt_desktop', 'claude_code', 'claude_desktop', 'codex', 'cursor'])
  })

  it('every guide shows the MCP URL and ends with the AI쓰발 consent, without a token or header', () => {
    for (const c of CLIENTS) {
      const g = oauthFor(c.id, URL_)
      if (!g) continue
      const text = JSON.stringify(g)
      expect(text, c.id).toContain(URL_)
      expect(text, c.id).not.toMatch(/Bearer|Authorization|--header|AISUBAL_TOKEN/)
      expect(g.steps.at(-1)?.title, c.id).toBe('AI쓰발에 로그인하고 허용')
    }
  })

  it('the Cursor deeplink installs the URL only', () => {
    const link = oauthFor('cursor', URL_)!.deeplink!
    const cfg = JSON.parse(Buffer.from(decodeURIComponent(link.split('config=')[1]), 'base64').toString('utf8'))
    expect(cfg).toEqual({ url: URL_ })
  })
})
