import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { hostedMoim } from '@/lib/profile-view'

const read = (p: string) => readFileSync(p, 'utf8')
const PAGE = 'src/app/(app)/members/[id]/page.tsx'
const m = (id: string, hostId: string, kind: 'real' | 'nickname' = 'real') => ({ id, hostId, host: { kind } })

describe('A91 · LinkedIn-style profile view', () => {
  it('hosted moim: only real-name hosting, upcoming first, deduped, capped', () => {
    const up = [m('u1', 'me'), m('u2', 'other'), m('u3', 'me', 'nickname')]
    const past = [m('p1', 'me'), m('u1', 'me'), m('p2', 'me'), m('p3', 'me')]
    const out = hostedMoim(up, past, 'me')
    expect(out.map((o) => [o.moim.id, o.upcoming])).toEqual([['u1', true], ['p1', false], ['p2', false]])
    expect(hostedMoim([m('n', 'me', 'nickname')], [], 'me')).toEqual([])
  })

  it('page: top card, section cards in order, owner-only pencils and prompts, ?edit=1 keeps the in-place editor', () => {
    const s = read(PAGE)
    const order = ['className="card pf-top"', 'id="about"', 'id="activity"', 'id="uses"', '<AgentsSection', 'id="made"', 'id="moim"'].map((k) => s.indexOf(k))
    expect(order.every((i) => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(s).toMatch(/const owner = isMe && sp\.preview !== '1'/)
    expect(s).toMatch(/const editing = isMe && sp\.edit === '1'/)
    expect(s).toMatch(/<ProfileCardEditor \{\.\.\.editor\}/)
    // empty sections stay hidden for others; the owner gets a prompt
    for (const cond of ['(links.length > 0 || badges.length > 0 || owner)', '(posts.length > 0 || owner)', '(!usesEmpty || owner)', '(agents.length > 0 || owner)', '(made.length > 0 || owner)', '(hosted.length > 0 || owner)']) expect(s).toContain(cond)
    expect(s.match(/<ProfileEmpty /g)?.length).toBe(5)
    // MECE: skill-type gallery tools are already skill chips; the old 'AI 스택' card and the AgentList duplicate are gone
    expect(s).toContain('tools.filter((t) => !SKILL_TYPES.includes(t.type))')
    expect(s).not.toMatch(/AgentList|AI 스택/)
    // A90 reorder stays: MyToolsList for the owner, the editor's chip rows
    expect(s).toMatch(/<MyToolsList\s+editable=\{owner\}/)
    expect(read('src/components/profile/profile-card-editor.tsx')).toContain('id="stack"')
  })

  it('activity shows 3 posts with 모두 보기; others see Follow, Friend and Share', () => {
    const s = read(PAGE)
    expect(s).toContain('posts.slice(0, 3)')
    expect(s).toContain('?all=posts')
    expect(s).toMatch(/<FollowButton[\s\S]*<FriendButton[\s\S]*<ProfileShareButton/)
  })

  it('styles and en keys exist', () => {
    const css = read('src/app/globals.css')
    for (const c of ['.pf-cover', '.pf-avatar', '.pf-section-head', '.pf-pencil', '.pf-empty', '.pf-more']) expect(css).toContain(c)
    const en = read('src/i18n/dict/en.ts')
    for (const k of ['한 줄 소개 추가', '모두 보기', '갤러리·런칭', '첫 글 쓰기', '내가 쓰는 것 편집']) expect(en).toContain(`"${k}":`)
  })
})
