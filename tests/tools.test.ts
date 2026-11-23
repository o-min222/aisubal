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
import { TOOL_ALIASES, handleDataTool, resolveToolAlias, withLegacyKey, type DataRpc } from '@/lib/mcp-data'
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
    expect(parseToolSort('trending')).toBe('popular')
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

  it('sorts by 인기 (users weigh most), 최신 (launch date) and AI 평가', () => {
    const a = entry({ id: 'a', user_count: 3, created_at: '2026-01-01T00:00:00Z' })
    const b = entry({ id: 'b', mention_count: 4, created_at: '2026-11-20T00:00:00Z' })
    const c = entry({ id: 'c', ai_rating_avg: 4.8, ai_rating_count: 2, launched_at: '2026-11-21T00:00:00Z', created_at: '2025-01-01T00:00:00Z' })
    expect(popularityScore(a)).toBeGreaterThan(popularityScore(b))
    expect(sortTools([b, c, a], 'popular')[0].id).toBe('a')
    expect(sortTools([a, b, c], 'newest').map((e) => e.id)).toEqual(['c', 'b', 'a'])
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

describe('MCP: unified tool names + legacy aliases', () => {
  const rpc = (data: unknown) => vi.fn(async () => ({ data, error: null })) as unknown as DataRpc & ReturnType<typeof vi.fn>

  it('resolves every old tool name to a new one', () => {
    expect(Object.keys(TOOL_ALIASES).sort()).toEqual(
      ['create_product', 'create_tool', 'create_toolbox_entry', 'list_products', 'list_toolbox', 'read_product', 'read_toolbox'].sort()
    )
    expect(resolveToolAlias('list_products', {}).args).toMatchObject({ category: 'launch', sort: 'upvotes' })
    expect(resolveToolAlias('list_toolbox', { type: 'mcp_server', sort: 'trending' }).args).toMatchObject({ category: 'mcp', sort: 'popular' })
    expect(resolveToolAlias('read_product', { productId: 'p1' }).args.entryId).toBe('p1')
    expect(resolveToolAlias('feed_list', { q: 1 })).toMatchObject({ name: 'feed_list', legacyKey: undefined })
    expect(withLegacyKey({ tools: [1] }, 'entries')).toEqual({ tools: [1], entries: [1] })
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

  it('submit_tool refuses product type (launches use launch_product)', async () => {
    const r = rpc(null)
    const out = await handleDataTool('submit_tool', { name: 'x', oneLiner: 'y', url: 'https://x.dev', type: 'product' }, 'tok_1234567890abcdef', r)
    expect(String(out.error)).toMatch(/launch_product/)
    expect(r).not.toHaveBeenCalled()
  })

  it('the anonymous board stays out of MCP', () => {
    const src = read('src/app/api/mcp/route.ts') + read('src/lib/mcp-data.ts')
    expect(src).not.toMatch(/anon_(list|thread|create)/)
  })
})

describe('routes, redirects and navigation', () => {
  it('old URLs redirect into /gallery', () => {
    const cfg = read('next.config.ts')
    expect(cfg).toMatch(/source: "\/toolbox", destination: "\/gallery"/)
    expect(cfg).toMatch(/source: "\/products\/new", destination: "\/gallery\/launch"/)
    expect(read('src/app/(app)/products/page.tsx')).toMatch(/\/gallery\?category=launch/)
    expect(read('src/app/(app)/products/[id]/page.tsx')).toMatch(/toolSlugForProduct/)
    expect(existsSync(path.join(root, 'src/app/(app)/toolbox'))).toBe(false)
  })

  it('side panel holds content sections only; account items live in the account menu', () => {
    const hrefs = SIDE_NAV.map((i) => i.href)
    expect(hrefs).toEqual(['/gallery', '/archive', '/moim', '/groups', '/anon'])
    // 네트워크 moved into 내 대시보드; the old URL redirects there
    expect(read('src/app/(app)/network/page.tsx')).toMatch(/redirect\(networkHref/)
    for (const h of ['/members/me', '/invites', '/settings', '/admin', '/toolbox', '/products']) expect(hrefs).not.toContain(h)
    const menu = read('src/components/shell/account-menu.tsx')
    for (const s of ['내 프로필', '초대', '설정', '관리', '로그아웃']) expect(menu).toContain(s)
    // A10: 설정 / 관리 are single rows (no expandable sub-lists); sections are picked inside the pages
    expect(menu).toMatch(/me\.isAdmin && \(\s*<Link href="\/admin"/)
    expect(menu).toContain('<Link href="/settings"')
    expect(menu).not.toMatch(/aria-expanded=\{expanded\}|account-sub/)
    expect(read('src/components/shell/bottom-tabs.tsx')).toMatch(/href: '\/gallery', label: (?:msg\()?'갤러리'/)
  })

  it('settings and admin have sub-sections with list → detail', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.label)).toEqual(['계정', '프로필 편집', '내 에이전트', '알림', '모바일 앱'])
    expect(ADMIN_SECTIONS.map((s) => s.label)).toEqual(['대시보드', '유저', '초대 트리', '갤러리 검토', '설치 확인', '신고', '익명 관리', '사이트 설정'])
    expect(subNavActive('/settings', '/settings/account', '/settings', '/settings/account')).toBe(true)
    expect(subNavActive('/settings/tokens', '/settings/account', '/settings', '/settings/account')).toBe(false)
    expect(read('src/app/(app)/admin/layout.tsx')).toMatch(/is_admin\) redirect/)
  })
})
