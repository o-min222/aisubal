import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { missionAnswerError, missionPostBody } from '@/lib/onboarding-rules'
import { DEFAULT_PREFS, NOTIFY_CATEGORIES, notificationSentence, type NotificationItem } from '@/lib/notifications'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43256'
const sql = readFileSync('supabase/migrations/0104_first_mission.sql', 'utf8')

// A54: one first question after the pledge; the answer is the first post and opens the feed.
// A55: that post gets a guaranteed first reader (inviter, and admins while the community is small).
describe('A54 first-question mission', () => {
  it('the post reads as question + answer; short answers are refused', () => {
    expect(missionPostBody('요즘 쓰는 AI는?', '  Claude랑 Cursor요  ')).toBe('Q. 요즘 쓰는 AI는?\n\nClaude랑 Cursor요')
    expect(missionAnswerError('짧아')).not.toBeNull()
    expect(missionAnswerError('열 글자는 넘는 답변이에요')).toBeNull()
  })

  it('gate: only a known-null first_mission_at redirects (an unknown value never locks anyone out)', () => {
    expect(readFileSync('src/app/(app)/layout.tsx', 'utf8')).toMatch(/member\.first_mission_at === null\) redirect\('\/welcome'\)/)
  })

  it('migration: existing members backfilled, prompts RPC-only, completion checks the post', () => {
    expect(sql).toMatch(/update public\.members set first_mission_at = coalesce\(signup_completed_at/)
    expect(sql).toContain('revoke all on public.onboarding_prompts from public, anon, authenticated')
    expect(sql).toMatch(/p\.visibility <> 'members'/)
    expect(sql).toMatch(/revoke all on function public\.onboarding_mission_complete\(uuid\) from public, anon/)
  })

  it('real path (dev): too short → 400; an answer → 201 with the new post', async () => {
    const short = await fetch(`${BASE_URL}/api/onboarding/mission`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: '짧아' }) })
    expect(short.status).toBe(400)
    const ok = await fetch(`${BASE_URL}/api/onboarding/mission`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: '요즘은 Claude Code로 리팩터링을 맡겨요.' }) })
    expect(ok.status).toBe(201)
    const body = await ok.json()
    // idempotent: a dev server that already did the mission answers first:false and writes nothing
    if (body.first) expect(body.postId).toBeTruthy()
    else expect(body.first).toBe(false)
  })
})

describe('A54 atomic submit (0105)', () => {
  const atomic = readFileSync('supabase/migrations/0105_mission_atomic.sql', 'utf8')
  it('post + done in one definer RPC, row-locked and idempotent; the two-step path is dropped', () => {
    expect(atomic).toMatch(/onboarding_mission_submit\(p_answer text, p_locale text default 'ko'\)[\s\S]*security definer/)
    expect(atomic).toMatch(/where id = v_me for update/)
    expect(atomic).toMatch(/if m\.first_mission_at is not null then\s+return jsonb_build_object\('ok', true, 'first', false, 'post', m\.first_mission_post/)
    expect(atomic).toContain('drop function if exists public.onboarding_mission_complete(uuid)')
    expect(atomic).toContain('revoke all on function public.onboarding__alert_first_post(uuid, uuid, uuid, text) from public, anon, authenticated')
    const data = readFileSync('src/lib/data/onboarding.ts', 'utf8')
    expect(data).toContain("rpc('onboarding_mission_submit'")
    expect(data).not.toContain('onboarding_mission_complete')
  })

  it('real path (dev): a second answer is a no-op that returns the first post', async () => {
    const post = (answer: string) => fetch(`${BASE_URL}/api/onboarding/mission`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer }) })
    const a = await (await post('첫 번째로 보내는 충분히 긴 답변이에요.')).json()
    const b = await (await post('두 번째로 보내는 충분히 긴 답변이에요.')).json()
    expect(b.first).toBe(false)
    if (a.first) expect(b.postId).toBe(a.postId)
  })
})

describe('A55 first-reaction guarantee', () => {
  it('own notification category, on by default, with a sentence', () => {
    expect(NOTIFY_CATEGORIES.some((c) => c.id === 'newcomers')).toBe(true)
    expect(DEFAULT_PREFS.newcomers).toBe(true)
    const n = { kind: 'first_post', count: 1, actor: { kind: 'member', id: 'm', name: '새벽CTO', avatarUrl: null } } as unknown as NotificationItem
    expect(notificationSentence(n)).toMatchObject({ name: '새벽CTO' })
  })

  it('migration: inviter always, admins only while members <= newcomer_alert_max (0 = off), deduped per member', () => {
    expect(sql).toMatch(/notify__push\(m\.invited_by_id, 'first_post', 'newcomers'/)
    expect(sql).toMatch(/if v_max > 0 and v_count <= v_max then/)
    expect(sql).toMatch(/id is distinct from m\.invited_by_id/)
    expect(sql).toContain("'firstpost:' || v_me")
    expect(sql).toContain("'meetups', 'newcomers') then raise exception 'bad_pref'")
  })
})
