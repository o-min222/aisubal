import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Behaviour was proven on prod with a rolled-back dry run (clean / re-fire / banned inviter);
// these pin the contract so a later edit can't silently drop a guarantee.
const sql = readFileSync('supabase/migrations/0074_invite_auto_connect.sql', 'utf8')
const slots = readFileSync('supabase/migrations/0073_invites_three.sql', 'utf8')

describe('invite auto-connect (0074)', () => {
  it('runs inside the redeem transaction: a trigger on the used_by_id update', () => {
    expect(sql).toMatch(/after update of used_by_id on public\.invite_codes/)
    expect(sql).toContain('old.used_by_id is not null')
  })

  it('follows both ways and asks inviter -> new member, idempotently', () => {
    expect(sql).toContain('values (v_inviter, v_new), (v_new, v_inviter)')
    expect(sql).toMatch(/insert into public\.friendships \(requester_id, addressee_id\)\s+values \(v_inviter, v_new\)\s+on conflict \(pair_low, pair_high\) do nothing/)
    expect(sql.match(/on conflict/g)).toHaveLength(2)
  })

  it('skips a missing, banned or not-yet-member inviter', () => {
    expect(sql).toContain('signup_completed_at is not null and is_banned = false')
  })

  it('keeps notices to the friend request and invite_joined (follow notices are silenced)', () => {
    expect(sql).toContain("dedupe_key = 'follow:' || v_inviter")
    expect(sql).toContain("dedupe_key = 'follow:' || v_new")
  })

  it('is not callable by clients and does not backfill', () => {
    expect(sql).toContain('revoke all on function public.invites__auto_connect() from public, anon, authenticated')
    expect(sql).not.toMatch(/update public\.invite_codes|insert into public\.follows[\s\S]*select/)
  })
})

describe('3 invite slots (0073)', () => {
  it('sets the site default and counts originals, never used codes', () => {
    expect(slots).toContain("'3'")
    expect(slots).toMatch(/renewed_from_id IS NULL/i)
  })
})
