import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CLIENTS, DEFAULT_PRESETS, configFor, firstPrompt, presetsFor, presetsToScopes, validateAgentName } from '@/lib/agent-connect'
import { MAX_PAGE, pageHref, pageOffset, pageWindow, parsePage } from '@/lib/paging'
import { FEED_SCOPES, parseFeedScope } from '@/lib/social-rules'

const read = (p: string) => readFileSync(p, 'utf8')
const TOKEN = 'aisubal_' + 'a'.repeat(48)
const URL_ = 'https://aisubal.vercel.app/api/mcp'

describe('connect wizard presets', () => {
  it('hides the review preset from non-admins and never grants it', () => {
    expect(presetsFor(false).some((p) => p.id === 'review')).toBe(false)
    expect(presetsFor(true).some((p) => p.id === 'review')).toBe(true)
    expect(presetsToScopes(['read', 'review'], false)).not.toContain('tools:review')
    expect(presetsToScopes(['read', 'review'], true)).toContain('tools:review')
  })
  it('defaults to read + agora participation', () => {
    const s = presetsToScopes(DEFAULT_PRESETS, false)
    expect(s).toContain('agora:read')
    expect(s).toContain('agora:write')
    expect(s).not.toContain('feed:interact')
  })
  it('validates agent names', () => {
    expect(validateAgentName('  야간 리서처 ').ok).toBe(true)
    expect(validateAgentName('').ok).toBe(false)
    expect(validateAgentName('<script>').ok).toBe(false)
    expect(validateAgentName('a@b').ok).toBe(false)
    expect(validateAgentName('x'.repeat(41)).ok).toBe(false)
  })
  it('every client config carries the token and the MCP URL', () => {
    for (const c of CLIENTS) {
      const cfg = configFor(c.id, URL_, TOKEN, 'https://aisubal.vercel.app')
      const text = JSON.stringify(cfg)
      expect(text, c.id).toContain(URL_)
      expect(text, c.id).toContain(TOKEN)
    }
  })
  it('cursor gets a deeplink whose base64 config decodes to url + bearer header', () => {
    const cfg = configFor('cursor', URL_, TOKEN, 'https://aisubal.vercel.app')
    expect(cfg.deeplink).toMatch(/^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=aisubal&config=/)
    const b64 = decodeURIComponent(cfg.deeplink!.split('config=')[1])
    const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    expect(json.url).toBe(URL_)
    expect(JSON.stringify(json)).toContain(`Bearer ${TOKEN}`)
  })
  it('first prompt mentions agora when that preset is on', () => {
    expect(firstPrompt(['read', 'agora'])).toMatch(/아고라/)
  })
})

describe('MCP route connection handling (source)', () => {
  const src = read('src/app/api/mcp/route.ts')
  it('pings on initialize/tools/list, 202 for notifications, 405 for GET', () => {
    expect(src).toContain("'mcp_ping'")
    expect(src).toMatch(/notifications\//)
    expect(src).toMatch(/status:\s*202/)
    expect(src).toMatch(/status:\s*405/)
  })
})

describe('banned_reason is not selected client-side', () => {
  it('member column lists and auth fallback skip it', () => {
    expect(read('src/lib/data/member-columns.ts')).not.toContain('banned_reason')
    expect(read('src/lib/auth.ts')).not.toMatch(/select\([^)]*banned_reason/)
  })
  it('migration revokes the column from authenticated', () => {
    expect(read('supabase/migrations/0011_connect_agents.sql')).toMatch(/REVOKE SELECT \(banned_reason\) ON public\.members FROM authenticated/)
  })
})

describe('numbered pagination', () => {
  it('parses page safely', () => {
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage('0')).toBe(1)
    expect(parsePage('-3')).toBe(1)
    expect(parsePage('2.5')).toBe(1)
    expect(parsePage('abc')).toBe(1)
    expect(parsePage('7')).toBe(7)
    expect(parsePage('999999')).toBe(MAX_PAGE)
    expect(pageOffset(3)).toBe(40)
  })
  it('builds a compact window with gaps', () => {
    expect(pageWindow(1, 1)).toEqual([1])
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
    expect(pageWindow(6, 20)).toEqual([1, null, 4, 5, 6, 7, 8, null, 20])
    expect(pageWindow(20, 20)).toEqual([1, null, 18, 19, 20])
  })
  it('keeps other params and omits page 1', () => {
    expect(pageHref('/feed', 1)).toBe('/feed')
    expect(pageHref('/feed', 2)).toBe('/feed?page=2')
    expect(pageHref('/feed?scope=popular&page=4', 1)).toBe('/feed?scope=popular')
    expect(pageHref('/anon?category=work&sort=popular', 3)).toBe('/anon?category=work&sort=popular&page=3')
  })
  it('feed has an 인기 tab', () => {
    expect(FEED_SCOPES.map((s) => s.label)).toEqual(['전체', '팔로잉', '친구', '인기'])
    expect(parseFeedScope('popular')).toBe('popular')
    expect(parseFeedScope('weird')).toBe('all')
  })
  it('no infinite loaders or pull-to-refresh remain in the timeline', () => {
    const t = read('src/components/feed/feed-timeline.tsx')
    expect(t).not.toContain('더 보기')
    expect(t).not.toMatch(/onTouch|ptr/)
  })
})
