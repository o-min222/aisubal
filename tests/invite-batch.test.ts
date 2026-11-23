import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { batchProgress, needsRefill, sortByBatch } from '@/lib/invite-batch'
import { notificationSentence, type NotificationItem } from '@/lib/notifications'
import { DICTS } from '@/i18n/dict'

const sql = readFileSync('supabase/migrations/0085_invite_batch_refill.sql', 'utf8')
const code = (batch: number, isUsed: boolean) => ({ batch, isUsed })

describe('A31 invite batches: all N joined → N more at once', () => {
  it('counts progress on the current batch only', () => {
    const codes = [code(1, true), code(1, true), code(1, true), code(1, true), code(1, true), code(2, true), code(2, false), code(2, false), code(2, false), code(2, false)]
    expect(batchProgress(codes, 5)).toEqual({ batch: 2, joined: 1, size: 5, completed: 1 })
    expect(batchProgress([], 5)).toEqual({ batch: 1, joined: 0, size: 5, completed: 0 })
  })
  it('asks the database to heal only when the batch is short or fully used', () => {
    expect(needsRefill([code(1, true), code(1, false), code(1, false)], 3)).toBe(false)
    expect(needsRefill([code(1, true), code(1, false), code(1, false)], 5)).toBe(true)
    expect(needsRefill([code(1, true), code(1, true), code(1, true)], 3)).toBe(true)
  })
  it('lists the current batch first', () => {
    expect(sortByBatch([{ ...code(1, true), id: 'a' }, { ...code(2, false), id: 'b' }]).map((c) => c.id)).toEqual(['b', 'a'])
  })
  it('the database reads N from the admin setting and refills atomically in the redeem path', () => {
    expect(sql).toMatch(/from public\.site_config where key = 'invites_per_member'/)
    expect(sql).toMatch(/for update;/)
    expect(sql).toMatch(/if v_unused > 0 then return 0; end if;/)
    expect(sql).toMatch(/create trigger invite_codes_refill after update of used_by_id on public\.invite_codes/)
    expect(sql).toMatch(/'invite_refill:' \|\| \(v_batch \+ 1\)/)
    expect(sql).toMatch(/invites__renew_due[\s\S]*select 0/)
  })
  it('notifies with the badge it earned, in ko and en', () => {
    const n: NotificationItem = { id: 'n', kind: 'invite_refill', category: 'invites', link: '/invites', excerpt: null, targetKind: 'member', count: 1, createdAt: '', unread: true, actor: { kind: 'someone', id: null, name: 'invite_king:2', avatarUrl: null } }
    const s = notificationSentence(n)
    expect(s).toMatchObject({ s: '초대장이 다시 채워졌어요 · ‘{name}’ 뱃지 획득', name: '초대왕 2단계', nameIsLabel: true })
    expect(DICTS.en![s.s as keyof typeof DICTS.en]).toBeTruthy()
  })
})
