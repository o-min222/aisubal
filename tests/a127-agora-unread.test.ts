import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { agoraHasUnread, type AgoraUnreadPost } from '@/lib/agora-unread-rules'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const me = 'dev-user-id'
const t = (iso: string, extra: Partial<AgoraUnreadPost> = {}): AgoraUnreadPost => ({
  parentId: null,
  ownerMemberId: 'member-other',
  createdAt: iso,
  ...extra,
})

describe('A127 Agora unread rules', () => {
  it('is off when there is no last-seen cursor (does not badge all history)', () => {
    expect(agoraHasUnread(me, null, [t('2026-11-28T00:00:00.000Z')])).toBe(false)
  })

  it('lights only for a newer root post by someone else', () => {
    const seen = '2026-11-28T10:00:00.000Z'
    expect(agoraHasUnread(me, seen, [t('2026-11-28T11:00:00.000Z')])).toBe(true)
    expect(agoraHasUnread(me, seen, [t('2026-11-28T09:00:00.000Z')])).toBe(false)
    expect(agoraHasUnread(me, seen, [t('2026-11-28T11:00:00.000Z', { ownerMemberId: me })])).toBe(false)
    expect(agoraHasUnread(me, seen, [t('2026-11-28T11:00:00.000Z', { parentId: 'p' })])).toBe(false)
    expect(agoraHasUnread(me, seen, [t('2026-11-28T11:00:00.000Z', { hidden: true })])).toBe(false)
    expect(agoraHasUnread(me, seen, [t('2026-11-28T11:00:00.000Z', { deleted: true })])).toBe(false)
  })
})

describe('A127 wiring', () => {
  it('migration: closed table, RLS, authenticated-only RPCs, root posts, own agents excluded', () => {
    const sql = read('supabase/migrations/0148_agora_unread_cursor.sql')
    expect(sql).toMatch(/create table public\.member_agora_seen/)
    expect(sql).toMatch(/enable row level security/)
    expect(sql).toMatch(/revoke all on table public\.member_agora_seen from public, anon, authenticated/)
    expect(sql).toMatch(/owner_member_id is distinct from v_me/)
    expect(sql).toMatch(/p\.parent_id is null/)
    expect(sql).toMatch(/grant execute on function public\.agora_unread\(\) to authenticated/)
    expect(sql).toMatch(/grant execute on function public\.agora_mark_seen\(\) to authenticated/)
    expect(sql).toMatch(/revoke all on function public\.agora_unread\(\), public\.agora_mark_seen\(\) from public, anon, authenticated/)
    expect(sql).not.toMatch(/console\.log/)
    expect(sql).not.toMatch(/service_role/)
  })

  it('the badge lives on the top-bar AI switch, not on the tab bar or side nav', () => {
    const sw = read('src/components/shell/mode-switch.tsx')
    expect(sw).toMatch(/\/api\/agora\/unread/)
    expect(sw).toMatch(/\/api\/agora\/seen/)
    expect(sw).toMatch(/className="nav-unread"/)
    expect(sw).toMatch(/AI, 새 글이 있어요/)
    expect(read('src/components/shell/bottom-tabs.tsx')).not.toMatch(/\/agora/)
    expect(read('src/components/shell/nav-items.ts')).not.toMatch(/\/agora/)
    expect(read('src/app/globals.css')).toMatch(/\.mode-switch \.nav-unread/)
  })
})
