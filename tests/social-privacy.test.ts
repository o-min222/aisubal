import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { detectPii, maskPii, maskPiiDeep, piiWarning } from '@/lib/pii'
import { validateHandle, validateDisplayName, validateLink, suggestHandle } from '@/lib/profile-rules'
import { applyBlock, canSeePrivate, decideOnApply, decideRsvp, waitlistPosition, type MoimRsvp } from '@/lib/moim-rules'
import { relationBadge, sortByRelation, socialProofLine, parseFeedScope, NO_RELATION, type Relation } from '@/lib/social-rules'
import { canModerate, canReadTimeline, canRemove, slugify } from '@/lib/group-rules'
import { layoutGraph } from '@/lib/graph-layout'
import { askPrompt } from '@/lib/ask-rules'
import { handleDataTool } from '@/lib/mcp-data'
import { REFUSED_TOOLS, TOOL_SPECS, getTool } from '@/lib/mcp/registry'

const read = (p: string) => readFileSync(p, 'utf8')

describe('PII detection and masking', () => {
  it('detects phone, email, RRN, card and address', () => {
    expect(detectPii('연락 010-1234-5678 주세요')).toContain('phone')
    expect(detectPii('+82 10 1234 5678')).toContain('phone')
    expect(detectPii('me@example.com 으로')).toContain('email')
    expect(detectPii('주민번호 900101-1234567')).toContain('rrn')
    expect(detectPii('카드 4111 1111 1111 1111')).toContain('card')
    expect(detectPii('서울시 강남구 테헤란로 123')).toContain('address')
  })
  it('does not flag dates, versions, uuids or non-Luhn numbers', () => {
    for (const s of ['2026-11-22 15:00', 'v1.2.3 릴리즈', 'e2d7887a-20d1-41b4-87fe-1a0a0f58ad40', '1234 5678 9012 3456', '가격 12,000원']) {
      expect(detectPii(s)).toEqual([])
    }
    expect(piiWarning('오늘 GPT-5 써봤어요')).toBeNull()
  })
  it('warns in Korean and masks text', () => {
    expect(piiWarning('010-1234-5678로 연락')).toMatch(/전화번호/)
    const m = maskPii('010-1234-5678 / me@example.com')
    expect(m).not.toContain('1234-5678')
    expect(m).not.toContain('me@example.com')
  })
  it('deep-masks agent payloads but keeps ids, urls and handles', () => {
    const out = maskPiiDeep({ id: 'p1', handle: 'agent_nerd', url: 'https://x.com/a', untrusted_text: '전화 010-9999-8888', nested: [{ body: 'a@b.co' }] })
    expect(out.id).toBe('p1')
    expect(out.handle).toBe('agent_nerd')
    expect(out.url).toBe('https://x.com/a')
    expect(out.untrusted_text).not.toContain('9999-8888')
    expect(out.nested[0].body).not.toContain('a@b.co')
  })
})

describe('self-made identity', () => {
  it('validates handles (lowercase, reserved words blocked)', () => {
    expect(validateHandle('@Agent_Nerd')).toEqual({ ok: true, handle: 'agent_nerd' })
    expect(validateHandle('ab').ok).toBe(false)
    expect(validateHandle('admin').ok).toBe(false)
    expect(validateHandle('한글핸들').ok).toBe(false)
  })
  it('validates display names', () => {
    expect(validateDisplayName('에이전트덕후').ok).toBe(true)
    expect(validateDisplayName('a').ok).toBe(false)
    expect(validateDisplayName('<script>').ok).toBe(false)
    expect(validateDisplayName('@someone').ok).toBe(false)
  })
  it('suggests a handle only from an ASCII self-made name', () => {
    expect(suggestHandle('mcp smith')).toBe('mcp_smith')
    expect(suggestHandle('픽셀마녀')).toBe('')
  })
  it('validates SNS links per kind', () => {
    expect(validateLink('github', 'github.com/colin')).toEqual({ ok: true, url: 'https://github.com/colin' })
    expect(validateLink('x', 'https://x.com/colin').ok).toBe(true)
    expect(validateLink('instagram', 'https://evil.com/colin').ok).toBe(false)
    expect(validateLink('website', 'javascript:alert(1)').ok).toBe(false)
    expect(validateLink('website', 'https://user:pw@site.com').ok).toBe(false)
    expect(validateLink('nope', 'https://a.com').ok).toBe(false)
  })
  it('물어보기 mentions by @handle, never a real name', () => {
    const p = askPrompt({ handle: 'agent_nerd', name: '에이전트덕후' }, 'Cursor', 'https://aisubal.vercel.app/tools/cursor')
    expect(p).toContain('@agent_nerd')
  })
  it('no public surface reads the Google name or email', () => {
    const cols = (read('src/lib/data/member-columns.ts').match(/'[^']*'/g) || []).join(' ')
    expect(cols).toMatch(/handle/)
    expect(cols).not.toMatch(/\bemail\b/)
    const sql = read('supabase/migrations/0010_privacy_profile.sql')
    expect(sql).toMatch(/REVOKE ALL ON public\.members FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/member_private/)
  })
})

const r = (id: string, status: MoimRsvp['status'], t: string): MoimRsvp =>
  ({ id, memberId: `m-${id}`, status, answers: {}, note: null, createdAt: t, waitlistedAt: status === 'waitlisted' ? t : null, decidedAt: null }) as MoimRsvp

describe('모임 rules', () => {
  it('first-come confirms until full, then waitlists; approval mode is pending', () => {
    expect(decideOnApply({ requiresApproval: false, capacity: 1 }, [])).toBe('confirmed')
    expect(decideOnApply({ requiresApproval: false, capacity: 1 }, [r('a', 'confirmed', '1')])).toBe('waitlisted')
    expect(decideOnApply({ requiresApproval: true, capacity: 9 }, [])).toBe('pending')
  })
  it('removing a confirmed attendee auto-promotes the first waitlisted', () => {
    const list = [r('a', 'confirmed', '1'), r('b', 'waitlisted', '3'), r('c', 'waitlisted', '2')]
    expect(waitlistPosition(list, 'c')).toBe(1)
    const res = decideRsvp(1, list, 'a', 'remove')
    expect(res.ok && res.promoted).toEqual(['c'])
  })
  it('place/link and attendee names only for host/managers and confirmed attendees', () => {
    expect(canSeePrivate(true, null)).toBe(true)
    expect(canSeePrivate(false, 'confirmed')).toBe(true)
    expect(canSeePrivate(false, 'waitlisted')).toBe(false)
    expect(canSeePrivate(false, 'pending')).toBe(false)
  })
  it('members-only 모임 blocks non-members; hosts cannot apply', () => {
    const base = { status: 'open' as const, startsAt: '2999-01-01T00:00:00Z', applyDeadline: null, isHost: false, membersOnly: true, groupId: 'g' }
    expect(applyBlock(base, { isGroupMember: false, myStatus: null })).toBe('moim_members_only')
    expect(applyBlock(base, { isGroupMember: true, myStatus: null })).toBeNull()
    expect(applyBlock({ ...base, isHost: true }, { isGroupMember: true, myStatus: null })).toBe('moim_host_cannot_apply')
  })
})

describe('follow vs friend', () => {
  const rel = (p: Partial<Relation>): Relation => ({ ...NO_RELATION, ...p })
  it('맞팔 is not friendship', () => {
    expect(relationBadge(rel({ iFollow: true, followsMe: true }))?.label).toBe('맞팔')
    expect(relationBadge(rel({ iFollow: true, followsMe: true, friend: 'friends' }))?.label).toBe('친구')
  })
  it('sorts friends → following → others and builds the social-proof header', () => {
    const items = [{ n: 'x', r: rel({}) }, { n: 'f', r: rel({ iFollow: true }) }, { n: 'fr', r: rel({ friend: 'friends' }) }]
    expect(sortByRelation(items, (i) => i.r).map((i) => i.n)).toEqual(['fr', 'f', 'x'])
    expect(socialProofLine(items.map((i) => i.r))).toBe('내 친구 중 1명이 써요')
  })
  it('feed scope parsing', () => {
    expect(parseFeedScope('friends')).toBe('friends')
    expect(parseFeedScope('bogus')).toBe('all')
  })
})

describe('groups', () => {
  it('roles and visibility', () => {
    expect(canModerate('mod')).toBe(true)
    expect(canModerate('member')).toBe(false)
    expect(canRemove('mod', 'owner', false)).toBe(false)
    expect(canReadTimeline({ joinPolicy: 'approval', isHidden: false }, null)).toBe(false)
    expect(canReadTimeline({ joinPolicy: 'approval', isHidden: false }, 'active')).toBe(true)
    expect(slugify('AI Builders!')).toMatch(/^[a-z0-9-]+$/)
    // Korean-only names get a starter address instead of an empty field (QA B-2)
    expect(slugify('실전 모임')).toMatch(/^group-[a-z0-9]+$/)
    expect(slugify('실전 모임')).toBe(slugify('실전 모임'))
    expect(slugify('Claude Code 실전')).toBe('claude-code')
  })
})

describe('invite graph layout', () => {
  it('places every node and adds a "+N" placeholder for unloaded children', () => {
    const { placed, edges } = layoutGraph(
      [
        { id: 'r', parentId: null, depth: 0, childCount: 3 },
        { id: 'a', parentId: 'r', depth: 1, childCount: 0 },
      ],
      'r'
    )
    expect(placed.find((p) => p.id === 'a')).toBeTruthy()
    const more = placed.find((p) => p.more)
    expect(more?.more?.remaining).toBe(2)
    expect(edges.some((e) => e.from === 'r' && e.to === 'a')).toBe(true)
  })
})

describe('agents (MCP) stay read-only for human commitments', () => {
  it('refuses 모임 apply/create and follow/friend even with a token', async () => {
    const rpc = async () => ({ data: null, error: null })
    for (const name of Object.keys(REFUSED_TOOLS)) {
      const res = await handleDataTool(name, {}, 'tok', rpc)
      expect(res.refused).toBe(true)
    }
  })
  it('advertises only read 모임 tools, wrapped as untrusted', () => {
    const names = TOOL_SPECS.map((t) => t.name)
    expect(names).not.toContain('rsvp_meetup')
    expect(names).not.toContain('create_meetup')
    for (const n of ['list_meetups', 'read_meetup', 'my_groups']) expect(getTool(n)?.untrusted).toBe('human')
  })
  it('MCP masks PII on untrusted reads and never exposes the anon board', () => {
    const route = read('src/app/api/mcp/route.ts') + read('src/lib/mcp/dispatch.ts')
    expect(route).toMatch(/maskPiiDeep/)
    expect(route).not.toMatch(/anon_posts|\/api\/anon/)
  })
})
