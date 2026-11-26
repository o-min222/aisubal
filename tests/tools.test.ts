import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolboxEntry } from '@/lib/supabase/types'
import {
  TOOL_CATEGORIES,
  categoryFromLegacyType,
  coUsage,
  filterTools,
  parseToolSort,
  popularityScore,
  sortTools,
  topTags,
  toolHref,
  typesForCategory,
} from '@/lib/tool-rules'
import { rankToolsForMember, toolReason } from '@/lib/recommend-rules'
import { handleDataTool, type DataRpc } from '@/lib/mcp-data'
import { RENAMED_TOOLS, resolveTool, unknownToolMessage } from '@/lib/mcp/registry'
import { SIDE_NAV } from '@/components/shell/nav-items'
import { ADMIN_SECTIONS, SETTINGS_SECTIONS, subNavActive } from '@/components/shell/account-nav'

const root = path.resolve(__dirname, '..')
const read = (p: string) => readFileSync(path.join(root, p), 'utf8')

function entry(over: Partial<ToolboxEntry>): ToolboxEntry {
  return {
    id: over.id ?? 'e',
    name: 'X',
    slug: over.slug ?? over.id ?? 'x',
    one_liner: '',
    description: '',
    type: 'mcp_server',
    tags: [],
    icon_url: null,
    canonical_url: 'https://x.dev',
    github_url: null,
    homepage_url: null,
    license: null,
    last_commit_at: null,
    source_repo: null,
    install_snippets: {},
    mention_count: 0,
    install_count: 0,
    avg_rating: 0,
    rating_count: 0,
    created_by_id: null,
    featured: false,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    user_count: 0,
    upvote_count: 0,
    ai_rating_avg: 0,
    ai_rating_count: 0,
    product_id: null,
    launched_at: null,
    ...over,
  } as ToolboxEntry
}

describe('tool rules (unified 툴 list)', () => {
  it('4 gallery categories; rules/prompts live under 스킬 and launches under 서비스', () => {
    expect(TOOL_CATEGORIES.map((c) => c.id)).toEqual(['mcp', 'skill', 'cli', 'service'])
    expect(typesForCategory('service')).toEqual(['saas_service', 'product'])
    expect(typesForCategory('skill')).toEqual(['agent_skill', 'cursor_rules', 'prompt'])
    expect(categoryFromLegacyType('launch')).toBe('service')
    expect(categoryFromLegacyType('rules')).toBe('skill')
    expect(typesForCategory(null)).toBeNull()
  })

  it('accepts legacy ?type= values from old /toolbox links', () => {
    expect(categoryFromLegacyType('mcp_server')).toBe('mcp')
    expect(categoryFromLegacyType('agent_skill')).toBe('skill')
    expect(categoryFromLegacyType('product')).toBe('service')
    expect(categoryFromLegacyType('cli')).toBe('cli')
    expect(categoryFromLegacyType('nope')).toBeNull()
    expect(parseToolSort('ai')).toBe('ai')
    // A49: unknown / missing sort → 최신 (newest member uploads first)
    expect(parseToolSort('trending')).toBe('newest')
    expect(parseToolSort(undefined)).toBe('newest')
    expect(parseToolSort('popular')).toBe('popular')
  })

  it('filters by category, tag, query and my tools', () => {
    const list = [
      entry({ id: 'a', type: 'mcp_server', tags: ['db'], name: 'Supabase MCP' }),
      entry({ id: 'b', type: 'product', tags: ['DB'], name: 'Launchy', product_id: 'p1' }),
      entry({ id: 'c', type: 'saas_service', tags: ['ai'], name: 'Svc' }),
    ]
    expect(filterTools(list, { category: 'service' }).map((e) => e.id)).toEqual(['b', 'c'])
    expect(filterTools(list, { tag: 'db' }).map((e) => e.id)).toEqual(['a', 'b'])
    expect(filterTools(list, { q: 'supa' }).map((e) => e.id)).toEqual(['a'])
    expect(filterTools(list, { onlyIds: new Set(['c']) }).map((e) => e.id)).toEqual(['c'])
    expect(topTags(list)[0]).toBe('db')
  })

  it('sorts by 인기 (users weigh most), 최신 (added to the gallery) and AI 평가', () => {
    const a = entry({ id: 'a', user_count: 3, created_at: '2026-01-01T00:00:00Z' })
    const b = entry({ id: 'b', mention_count: 4, created_at: '2026-11-20T00:00:00Z' })
    const c = entry({ id: 'c', ai_rating_avg: 4.8, ai_rating_count: 2, launched_at: '2026-11-21T00:00:00Z', created_at: '2025-01-01T00:00:00Z' })
    expect(popularityScore(a)).toBeGreaterThan(popularityScore(b))
    expect(sortTools([b, c, a], 'popular')[0].id).toBe('a')
    // A49: 최신 = created_at (a member's upload), not the upstream launch date
    expect(sortTools([a, b, c], 'newest').map((e) => e.id)).toEqual(['b', 'a', 'c'])
    expect(sortTools([a, b, c], 'ai')[0].id).toBe('c')
    expect(toolHref({ slug: 'claude-code' })).toBe('/gallery/claude-code')
  })

  it('co-usage: tools used by people who share my tools, excluding mine', () => {
    const pairs = [
      { member_id: 'me', entry_id: 't1' },
      { member_id: 'p1', entry_id: 't1' },
      { member_id: 'p1', entry_id: 't2' },
      { member_id: 'p2', entry_id: 't1' },
      { member_id: 'p2', entry_id: 't2' },
      { member_id: 'p2', entry_id: 't3' },
      { member_id: 'stranger', entry_id: 't9' },
    ]
    const co = coUsage(pairs, 'me')
    expect(co.get('t2')).toBe(2)
    expect(co.get('t3')).toBe(1)
    expect(co.has('t1')).toBe(false)
    expect(co.has('t9')).toBe(false)

    const tools = [entry({ id: 't1' }), entry({ id: 't2' }), entry({ id: 't3', tags: ['mcp'] }), entry({ id: 't9', user_count: 9 })]
    const ranked = rankToolsForMember(tools, ['mcp'], new Set(['t1']), 3, co)
    expect(ranked.map((r) => r.id)).toEqual(['t2', 't3', 't9'])
    expect(toolReason(ranked[0])).toBe('나와 같은 걸 쓰는 2명이 사용 중')
    expect(toolReason({ coUsers: 0, matchedTag: null, user_count: 9 })).toBe('9명이 사용 중')
  })
})

describe('사용 중 (mock store)', () => {
  beforeEach(async () => {
    process.env.DEV_BYPASS_AUTH = 'true'
    const { __resetToolUsageMock } = await import('@/lib/data/tools')
    __resetToolUsageMock()
  })

  it('toggles usage, updates counts, lists my tools and the users strip', async () => {
    const { listTools, setToolUsage, getToolUsers, listMemberTools } = await import('@/lib/data/tools')
    const all = await listTools('member-9')
    const target = all.find((t) => !t.used_by_me)!
    const before = target.user_count ?? 0
    expect(await setToolUsage(target.id, 'member-9', true)).toBe(before + 1)
    expect(await setToolUsage(target.id, 'member-9', true)).toBe(before + 1) // idempotent
    const users = await getToolUsers(target.id, 'member-9')
    expect(users.usedByMe).toBe(true)
    expect(users.count).toBe(before + 1)
    expect((await listMemberTools('member-9')).map((t) => t.id)).toContain(target.id)
    expect(await setToolUsage(target.id, 'member-9', false)).toBe(before)
    expect((await listMemberTools('member-9')).map((t) => t.id)).not.toContain(target.id)
  })

  it('includes launches in the same list and resolves old product ids', async () => {
    const { listTools, toolSlugForProduct } = await import('@/lib/data/tools')
    const launches = (await listTools('dev-user-id', { category: 'service' })).filter((t) => t.type === 'product')
    expect(launches.length).toBeGreaterThan(0)
    expect(launches.every((t) => t.type === 'product' && t.product_id)).toBe(true)
    expect(await toolSlugForProduct(launches[0].product_id!)).toBe(launches[0].slug)
  })
})

describe('MCP: unified tool names (old names removed 2026-11-24)', () => {
  const rpc = (data: unknown) => vi.fn(async () => ({ data, error: null })) as unknown as DataRpc & ReturnType<typeof vi.fn>

  it('old tool names are unknown; the error names the current tool', () => {
    // pre-0006 gallery names, pre-archive names and every A66 P2 rename: hint only, never resolved
    expect(Object.keys(RENAMED_TOOLS)).toEqual(
      expect.arrayContaining(['create_product', 'create_tool', 'create_toolbox_entry', 'list_products', 'list_toolbox', 'read_product', 'read_toolbox', 'list_archive', 'search_archive', 'get_archive_item', 'save_to_archive', 'get_charter', 'search_posts', 'list_tools', 'install_tool', 'submit_tool', 'agora_post_review', 'review_approve'])
    )
    for (const old of ['get_install_instructions', 'review_reject', 'list_products', 'list_toolbox', 'read_product']) expect(resolveTool(old, {})).toEqual({ kind: 'unknown' })
    expect(unknownToolMessage('review_reject')).toBe("Unknown tool: review_reject. It was renamed: use review_decide with action='reject'. Run tools/list for the current names.")
    expect(unknownToolMessage('nope')).toBe('Unknown tool: nope')
    expect(resolveTool('feed_list', { q: 1 })).toEqual({ kind: 'tool', spec: expect.objectContaining({ name: 'feed_list' }), args: { q: 1 } })
  })

  it('list_tools calls mcp_tools_list with category / sort / mine', async () => {
    const r = rpc([{ id: '1', slug: 's', type: 'product', product_id: 'p', upvote_count: 3, user_count: 2, used_by_me: true }])
    const out = await handleDataTool('list_tools', { category: 'launch', sort: 'ai', mine: true }, 'tok_1234567890abcdef', r)
    expect(r).toHaveBeenCalledWith('mcp_tools_list', expect.objectContaining({ p_category: 'launch', p_sort: 'ai', p_mine: true }))
    const t = (out.tools as Array<Record<string, unknown>>)[0]
    expect(t).toMatchObject({ category: 'launch', upvotes: 3, userCount: 2, usedByMe: true, page: '/gallery/s' })
  })

  it('set_tool_usage goes through the token RPC', async () => {
    const r = rpc({ entryId: 'e', using: false, userCount: 0 })
    await handleDataTool('set_tool_usage', { entryId: 'claude-code', using: false }, 'tok_1234567890abcdef', r)
    expect(r).toHaveBeenCalledWith('mcp_tool_usage', expect.objectContaining({ p_entry: 'claude-code', p_using: false }))
  })

  it('0117: the duplicate-submit hint names gallery_use, not the removed set_tool_usage', () => {
    const sql = readFileSync('supabase/migrations/0117_tool_submit_hint.sql', 'utf8')
    expect(sql).toMatch(/replace\(d, 'set_tool_usage로', 'gallery_use로'\)/)
  })

  it('gallery_submit refuses product type (launches use gallery_launch)', async () => {
    const r = rpc(null)
    const out = await handleDataTool('submit_tool', { name: 'x', oneLiner: 'y', url: 'https://x.dev', type: 'product' }, 'tok_1234567890abcdef', r)
    expect(String(out.error)).toMatch(/gallery_launch/)
    expect(r).not.toHaveBeenCalled()
  })

  it('the anonymous board stays out of MCP', () => {
    const src = ['src/app/api/mcp/route.ts', 'src/lib/mcp-data.ts', 'src/lib/mcp/tools.ts', 'src/lib/mcp/dispatch.ts', 'src/lib/mcp/server.ts'].map(read).join('\n')
    expect(src).not.toMatch(/anon_(list|thread|create)/)
  })
})

describe('routes, redirects and navigation', () => {
  it('old URLs redirect into /gallery', () => {
    const cfg = read('next.config.ts')
    expect(cfg).toMatch(/source: "\/toolbox", destination: "\/gallery"/)
    expect(cfg).toMatch(/source: "\/products\/new", destination: "\/gallery\/new"/) // A87
    expect(read('src/app/(app)/products/page.tsx')).toMatch(/\/gallery\?category=launch/)
    expect(read('src/app/(app)/products/[id]/page.tsx')).toMatch(/toolSlugForProduct/)
    expect(existsSync(path.join(root, 'src/app/(app)/toolbox'))).toBe(false)
  })

  it('side panel holds content sections only; account items live in the account menu', () => {
    const hrefs = SIDE_NAV.map((i) => i.href)
    expect(hrefs).toEqual(['/gallery', '/archive', '/moim', '/groups', '/anon'])
    // the invite network moved to 친구·팔로워 (A70); the old URL redirects there
    expect(read('src/app/(app)/network/page.tsx')).toMatch(/redirect\(networkHref/)
    for (const h of ['/members/me', '/invites', '/settings', '/admin', '/toolbox', '/products']) expect(hrefs).not.toContain(h)
    const menu = read('src/components/shell/account-menu.tsx')
    for (const s of ['프로필 보기', '내 에이전트', '친구·팔로워', '초대', '설정', '관리', '로그아웃']) expect(menu).toContain(s)
    // A71 MECE: every destination appears once in the account menu (the header row is the profile link)
    const menuHrefs = [...menu.matchAll(/<Link href="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(menuHrefs).size).toBe(menuHrefs.length)
    // A10: 설정 / 관리 are single rows (no expandable sub-lists); sections are picked inside the pages
    expect(menu).toMatch(/me\.isAdmin && \(\s*<Link href="\/admin"/)
    expect(menu).toContain('<Link href="/settings"')
    expect(menu).not.toMatch(/aria-expanded=\{expanded\}|account-sub/)
    expect(read('src/components/shell/bottom-tabs.tsx')).toMatch(/href: '\/gallery', label: (?:msg\()?'갤러리'/)
  })

  it('settings and admin have sub-sections with list → detail', () => {
    // A71 (t297u): 내 에이전트 lives in the account menu only
    expect(SETTINGS_SECTIONS.map((s) => s.label)).toEqual(['계정', '프로필 편집', '알림', '모바일 앱'])
    expect(SETTINGS_SECTIONS.map((s) => s.href)).not.toContain('/agents')
    expect(ADMIN_SECTIONS.map((s) => s.label)).toEqual(['대시보드', '유저', '초대 네트워크 (전체)', '대기 명단', '갤러리 기록', '설치 확인', '피드백', '신고', '익명 관리', '사이트 설정'])
    expect(subNavActive('/settings', '/settings/account', '/settings', '/settings/account')).toBe(true)
    expect(subNavActive('/settings/tokens', '/settings/account', '/settings', '/settings/account')).toBe(false)
    expect(read('src/app/(app)/admin/layout.tsx')).toMatch(/is_admin\) redirect/)
  })
})
