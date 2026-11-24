import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import en from '@/i18n/dict/en'
import { QUICK_STARTERS } from '@/lib/quick-post-rules'
import { notificationSentence, type NotificationItem } from '@/lib/notifications'
import { pushPayload } from '@/lib/push-rules'

const SQL = readFileSync('supabase/migrations/0127_question_fanout.sql', 'utf8')
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const item: NotificationItem = {
  id: 'n', kind: 'question', category: 'following', link: '/posts/p1', excerpt: 'Cursor 룰 공유 돼요?', targetKind: 'post',
  count: 1, createdAt: new Date().toISOString(), unread: true, actor: { kind: 'member', id: 'm1', name: '소연', avatarUrl: null },
}

describe('A93 · 질문해요 posts notify friends and followers (0127)', () => {
  it('the SQL detects exactly the composer chip prefill, in both locales', () => {
    const ask = QUICK_STARTERS.find((s) => s.id === 'ask')!.prefill!
    const enAsk = (en as Record<string, string>)[ask]
    expect(enAsk).toBeTruthy()
    for (const p of [ask, enAsk]) {
      // post__is_question and post__question_line both carry the pattern
      expect(SQL.split(reEsc(p.trim()).replace(/\\\?/g, '\\?')).length - 1).toBeGreaterThanOrEqual(2)
    }
  })

  it('recipients: followers ∪ friends, deduped by union, visibility, bans, prefs; never the author; root real-name member posts only', () => {
    expect(SQL).toMatch(/from public\.follows f where f\.followee_id = new\.author_id\s+union\s+select/)
    expect(SQL).toContain("fr.status = 'accepted'")
    expect(SQL).toContain('public.post__can_see(new.author_id, new.visibility, r.id)')
    expect(SQL).toContain('not m.is_banned')
    expect(SQL).toContain('coalesce(p.following, true)')
    expect(SQL).toContain('r.id <> new.author_id')
    expect(SQL).toMatch(/p\.parent_id is not null or p\.group_id is not null or p\.author_kind <> 'member' or p\.posted_as <> 'real'/)
    expect(SQL).toContain("coalesce(p.visibility, 'members') = 'private'")
  })

  it('cap from site_config (default 3) per KST day; idempotent per post; replaces follow_post only when it fans out', () => {
    expect(SQL).toContain("('question_fanout_daily_cap', '3')")
    expect(SQL).toContain("at time zone 'Asia/Seoul')::date = v_day) < v_cap")
    expect(SQL).toMatch(/post_id uuid primary key references public\.posts/)
    expect(SQL).toContain('on conflict (post_id) do nothing;\n  if not found then return null;')
    expect(SQL).toContain("'question:' || new.id")
    expect(SQL).toContain('if public.question__fanout_due(new) then return null; end if;')
    // follow_post fires before question (trigger names sort), so the check sees no claim yet
    expect('posts_notify_follow_post' < 'posts_notify_question').toBe(true)
  })

  it('grants: the log table and helpers are closed to clients; RLS on', () => {
    expect(SQL).toContain('alter table public.question_fanouts enable row level security;')
    expect(SQL).toContain('revoke all on public.question_fanouts from public, anon, authenticated;')
    for (const f of ['post__is_question(text)', 'post__question_line(text)', 'question__fanout_due(public.posts)', 'notify__question_post()'])
      expect(SQL).toContain(`revoke all on function public.${f} from public, anon, authenticated;`)
    expect(SQL).toMatch(/'digest_nudge','question'\]\)\)/)
  })

  it("copy: '{name}님이 질문했어요' in the bell; push reads '…질문했어요: {first line}' and opens the post", () => {
    expect(notificationSentence(item).s).toBe('{name}님이 질문했어요')
    const t = (s: string, v?: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ''))
    const p = pushPayload({ outboxId: 1, subscriptionId: 's', endpoint: 'e', p256dh: 'k', auth: 'a', locale: 'ko', unread: 2, item }, t)
    expect(p.body).toBe('소연님이 질문했어요: Cursor 룰 공유 돼요?')
    expect(p.url).toBe('/posts/p1')
    expect((en as Record<string, string>)['{name}님이 질문했어요']).toBe('{name} asked a question')
  })
})
