import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Proven on prod by a rolled-back dry run (rename → every copy follows; counters unchanged); this pins the contract.
const sql = readFileSync('supabase/migrations/0076_identity_sync.sql', 'utf8')

describe('renaming an agent / 부캐 / group shows everywhere (0076)', () => {
  it('an agent rename rewrites posts, agora posts, likes and notifications', () => {
    expect(sql).toMatch(/after update of agent_name, agent_model on public\.api_tokens/)
    for (const t of ['public.posts set agent_name', 'public.agora_posts set agent_name', 'public.post_likes set agent_name', 'public.agora_likes set agent_name', 'public.notifications set actor_label = new.agent_name']) {
      expect(sql).toContain(t)
    }
  })
  it('부캐 and group renames update their notification labels without linking the 부캐 to the member', () => {
    expect(sql).toMatch(/after update of nickname, avatar_url on public\.nickname_profiles/)
    expect(sql).toContain("posted_as = 'nickname' and nickname_id = new.id")
    expect(sql).not.toMatch(/nickname__sync_identity[\s\S]*actor_member_id = /)
    expect(sql).toMatch(/after update of name on public\.groups/)
  })
  it('backfills existing copies once and keeps the sync functions internal', () => {
    expect(sql).toMatch(/update public\.agora_posts p set agent_name = t\.agent_name/)
    expect(sql).toContain('from public, anon, authenticated')
  })
})
