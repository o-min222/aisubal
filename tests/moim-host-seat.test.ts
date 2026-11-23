import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { moimErrorMessage } from '@/lib/moim-rules'

const sql = readFileSync('supabase/migrations/0091_moim_host_counts.sql', 'utf8')

// A38: the host holds a confirmed seat, so every count / capacity check includes them.
describe('moim host seat', () => {
  it('seats the host on create, guards the seat, backfills without bumping anyone', () => {
    expect(sql).toContain('create trigger meetups_seat_host after insert on public.meetups')
    expect(sql.match(/moim_host_seat/g)!.length).toBeGreaterThanOrEqual(2)
    expect(sql).toMatch(/if v_conf > m\.capacity then update public\.meetups set capacity = v_conf/)
    expect(moimErrorMessage(new Error('moim_host_seat'))).toContain('호스트 자리')
  })
})
