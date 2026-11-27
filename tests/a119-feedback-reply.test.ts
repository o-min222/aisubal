import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FEEDBACK_THANKS, FEEDBACK_REJECT_TEMPLATES, myFeedbackPath } from '@/lib/feedback'
import { notificationSentence, type NotificationItem } from '@/lib/notifications'
import { pushPayload, type PushJob } from '@/lib/push-rules'
import { makeT } from '@/i18n/translate'
import { DICTS } from '@/i18n/dict'

const read = (p: string) => readFileSync(p, 'utf8')
const base = {
  id: 'n', category: 'admin' as const, link: '/me/feedback/abc', excerpt: '이미 같은 내용이 반영되어 있어요.',
  targetKind: 'feedback' as const, count: 1, createdAt: new Date().toISOString(), unread: true,
  actor: { kind: 'someone' as const, id: null, name: null, avatarUrl: null },
}

describe('A119 reject → author', () => {
  it('keeps the dayoung footer and optional reason templates', () => {
    expect(FEEDBACK_THANKS).toBe('special thanks to dayoung')
    expect(FEEDBACK_REJECT_TEMPLATES.length).toBeGreaterThanOrEqual(3)
    expect(myFeedbackPath('abc')).toBe('/me/feedback/abc')
    expect(read('src/app/(app)/admin/feedback/[id]/feedback-detail.tsx')).toContain('FeedbackThanks')
    expect(read('src/app/(app)/admin/feedback/page.tsx')).toContain('FeedbackThanks')
    expect(read('src/app/(app)/me/feedback/page.tsx')).toContain('FeedbackThanks')
    expect(read('src/components/feedback/feedback-reject-sheet.tsx')).toContain('적지 않아도 거절할 수 있어요')
    expect(read('src/components/feedback/feedback-reject-sheet.tsx')).toContain('FEEDBACK_REJECT_TEMPLATES')
  })

  it('does not fire the approval webhook on reject', () => {
    const route = read('src/app/api/admin/feedback/[id]/route.ts')
    expect(route).toMatch(/if \(p\.data\.action === 'approve' \|\| p\.data\.action === 'resend'\)/)
    const rejectBlock = route.slice(route.indexOf("if (p.data.action === 'reject')"))
    expect(rejectBlock).not.toMatch(/sendDevRequest/)
    const sql = read('supabase/migrations/0141_feedback_author_reply.sql')
    expect(sql).toMatch(/feedback_items__author_notify/)
    expect(sql).not.toMatch(/sendDevRequest|feedback\.approved|FEEDBACK_WEBHOOK/)
    expect(sql).toMatch(/kind in \('feedback_approved', 'feedback_deployed'\)/)
  })

  it('authors read only their own rows through RPCs, table stays revoke-all', () => {
    const sql = read('supabase/migrations/0141_feedback_author_reply.sql')
    expect(sql).toMatch(/feedback_mine_list/)
    expect(sql).toMatch(/x\.author_id = v_me/)
    expect(sql).toMatch(/id = p_id and author_id = v_me/)
    expect(sql).not.toMatch(/grant [a-z, ]+ on public\.feedback_items/)
    expect(sql).toMatch(/revoke all on function public\.feedback_mine_list\(integer\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.feedback_mine_list\(integer\) to authenticated/)
    expect(sql).toMatch(/revoke all on function public\.feedback_mine_get\(uuid\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.feedback_mine_get\(uuid\) to authenticated/)
  })

  it('bell copy shows the reason and opens 내 피드백, ko and en; approved/deployed have no push body requirement', () => {
    const ko = makeT('ko', null), en = makeT('en', DICTS.en)
    const reply = { ...base, kind: 'feedback_reply' } as NotificationItem
    expect(notificationSentence(reply).s).toBe('피드백에 답변이 왔어요')
    const job = (kind: string, extra: Record<string, unknown> = {}): PushJob => ({
      outboxId: 1, subscriptionId: 's', endpoint: 'e', p256dh: 'p', auth: 'a', locale: 'ko', unread: 1,
      item: { ...reply, kind, ...extra } as NotificationItem,
    })
    const pushed = pushPayload(job('feedback_reply'), ko)
    expect(pushed.body).toContain('피드백에 답변이 왔어요')
    expect(pushed.body).toContain('이미 같은 내용이 반영되어 있어요.')
    expect(pushed.url).toBe('/me/feedback/abc')
    expect(pushPayload(job('feedback_reply'), en).body).toContain('There’s a reply to your feedback')
    expect(notificationSentence({ ...reply, kind: 'feedback_approved', excerpt: null }).s).toBe('피드백이 승인됐어요')
    expect(notificationSentence({ ...reply, kind: 'feedback_deployed', excerpt: null }).s).toBe('피드백이 반영되어 배포됐어요')
  })

  it('inbox and detail open the reason sheet; 내 피드백 views exist', () => {
    expect(read('src/app/(app)/admin/feedback/page.tsx')).toContain('FeedbackInbox')
    expect(read('src/app/(app)/admin/feedback/[id]/feedback-detail.tsx')).toContain('setRejectOpen(true)')
    expect(read('src/app/(app)/admin/feedback/[id]/feedback-detail.tsx')).not.toMatch(/confirm\(/)
    expect(read('src/app/(app)/me/page.tsx')).toContain('/me/feedback')
    expect(read('src/app/api/feedback-shot/[id]/route.ts')).toContain('getMyFeedback')
  })
})
