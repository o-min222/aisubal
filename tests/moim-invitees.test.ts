import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:43210'
const sql = readFileSync('supabase/migrations/0087_moim_invitees.sql', 'utf8')
const setFn = sql.slice(sql.indexOf('function public.moim_invites_set'), sql.indexOf('-- the edit form'))
const removal = setFn.slice(setFn.indexOf('-- removed:'), setFn.indexOf('-- added:'))

describe('A35: the host edits a 모임\'s invitees', () => {
  it('removed invitees lose the pending invite quietly; RSVPs are never touched', () => {
    expect(removal).toMatch(/delete from public\.moim_invites/)
    expect(removal).toMatch(/delete from public\.notifications where recipient_id = r\.member_id and kind = 'moim_invite'/)
    expect(removal).not.toMatch(/notify__push|moim__notify_invite/)
    expect(sql).not.toMatch(/(update|delete from) public\.meetup_rsvps/)
  })
  it('only new invitees are notified, with the same permission and group limit as create', () => {
    expect(setFn).toMatch(/on conflict do nothing;\s+if found then\s+perform public\.moim__notify_invite/)
    expect(setFn).toMatch(/moim__can_manage\(p_id, v_me\)/)
    expect(sql).toMatch(/m\.group_id is null or public\.group__role\(m\.group_id, mm\.id\) is not null/)
    expect(setFn).toMatch(/> 30 then raise exception 'moim_too_many_invites'/)
  })
  it('PATCH sets the list: adds, removes, and leaves it alone when absent', async () => {
    const patch = async (body: object) => (await fetch(`${BASE}/api/moim/moim-1`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
    const cur = (await (await fetch(`${BASE}/api/moim/moim-1`)).json()).moim
    const base = { title: cur.title, mode: cur.mode, venueName: cur.venueName ?? '', startsAt: cur.startsAt, timeTbd: cur.timeTbd ?? false, groupId: null, membersOnly: cur.membersOnly }
    await patch({ ...base, invites: [] }) // dev mock state persists between runs
    expect((await patch({ ...base, invites: ['prompt_jar', '@mcp_smith'] })).invites).toEqual({ added: 2, removed: 0 })
    expect((await patch({ ...base, invites: ['mcp_smith'] })).invites).toEqual({ added: 0, removed: 1 })
    expect((await patch(base)).invites).toBeNull()
    expect((await patch({ ...base, invites: [] })).invites).toEqual({ added: 0, removed: 1 })
  })
})
