import { describe, expect, it } from 'vitest'
import { PREVIEW_MAX, previewSnippet, pushActorName, pushPayload, type PushJob } from '@/lib/push-rules'
import { interpolate, makeT } from '@/i18n/translate'
import { DICTS } from '@/i18n/dict'
import type { NotificationItem } from '@/lib/notifications'
import { DEFAULT_PREFS } from '@/lib/notifications'

const t = interpolate
const job = (item: NotificationItem, extra: Partial<PushJob> = {}): PushJob => ({
  outboxId: 1, subscriptionId: 's', endpoint: 'https://fcm.googleapis.com/x', p256dh: 'B'.repeat(87), auth: 'a'.repeat(22),
  locale: 'ko', unread: 2, item, ...extra,
})
const item = (over: Partial<NotificationItem> & Pick<NotificationItem, 'kind'>): NotificationItem => ({
  id: 'n1', category: 'replies', link: '/posts/p1', excerpt: null, targetKind: 'post', targetId: 'p1',
  count: 1, createdAt: '', unread: true,
  actor: { kind: 'member', id: 'm2', name: '새벽CTO', handle: 'dawn', avatarUrl: null },
  ...over,
} as NotificationItem)

describe('A131 · push content preview', () => {
  it('preview is on by default and is not a category toggle', () => {
    expect(DEFAULT_PREFS.preview).toBe(true)
  })

  it('strips markup, collapses whitespace, masks PII, and caps length with an ellipsis', () => {
    expect(previewSnippet('  안녕   **세계**  [링크](https://x.test)  ')).toBe('안녕 세계 링크')
    expect(previewSnippet('# 제목\n> 인용\n본문 <b>굵게</b>')).toBe('제목 인용 본문 굵게')
    expect(previewSnippet('연락은 010-1234-5678 로')).toMatch(/연락은 .+ 로/)
    expect(previewSnippet('010-1234-5678')).not.toContain('010-1234-5678')
    const long = '가'.repeat(PREVIEW_MAX + 10)
    const out = previewSnippet(long)
    expect([...out].length).toBe(PREVIEW_MAX)
    expect(out.endsWith('…')).toBe(true)
    expect(previewSnippet('')).toBe('')
    expect(previewSnippet(null)).toBe('')
  })

  it('comment / reply: title is @handle + action, body is the snippet — one line, so a lock screen shows it', () => {
    const comment = pushPayload(job(item({ kind: 'comment', excerpt: '계획 먼저 쓰게 하니까 실패율이 줄었어요.\n둘째 줄' })), t)
    expect(comment.title).toBe('@dawn님이 내 글에 댓글을 남겼어요')
    expect(comment.body).toBe('계획 먼저 쓰게 하니까 실패율이 줄었어요. 둘째 줄')
    expect(comment.body).not.toContain('\n')
    expect(comment.url).toBe('/posts/p1')
    expect(comment.tag).toBe('comment:p1')
    const en = pushPayload(job(item({ kind: 'comment', excerpt: 'nice take' })), makeT('en', DICTS.en))
    expect(en.title).toBe('@dawn commented on your post')
    expect(en.body).toBe('nice take')
    const reply = pushPayload(job(item({ kind: 'reply', excerpt: '동감해요' })), t)
    expect(reply.title).toBe('@dawn님이 내 댓글에 답글을 남겼어요')
    expect(reply.body).toBe('동감해요')
  })

  it('falls back to the display name when there is no handle, and never names an anonymous author', () => {
    const named = pushPayload(job(item({ kind: 'comment', excerpt: 'hi', actor: { kind: 'member', id: 'm2', name: '새벽CTO', handle: null, avatarUrl: null } })), t)
    expect(named.title).toBe('새벽CTO님이 내 글에 댓글을 남겼어요')
    const anon = pushPayload(job(item({ kind: 'comment', targetKind: 'anon', excerpt: '익명 댓글입니다', actor: { kind: 'anon', id: null, name: '익명', handle: 'secret', avatarUrl: null } })), t)
    expect(anon.title).toBe('누군가님이 내 익명 글에 댓글을 남겼어요')
    expect(anon.title).not.toContain('secret')
    expect(anon.title.startsWith('익명님') || anon.title.startsWith('@secret')).toBe(false)
    expect(anon.body).toBe('익명 댓글입니다')
    const like = pushPayload(job(item({ kind: 'like', category: 'likes', excerpt: null, actor: { kind: 'someone', id: null, name: null, avatarUrl: null }, count: 1 })), t)
    expect(like.title).toMatch(/익명 글을 좋아해요/)
    expect(like.body).toBe('')
  })

  it('omits the body when the member turns the preview pref off; the title still names the action', () => {
    const on = pushPayload(job(item({ kind: 'comment', excerpt: '비밀 본문' }), { preview: true }), t)
    const off = pushPayload(job(item({ kind: 'comment', excerpt: '비밀 본문' }), { preview: false }), t)
    expect(on.body).toBe('비밀 본문')
    expect(off.title).toBe('@dawn님이 내 글에 댓글을 남겼어요')
    expect(off.body).toBe('')
  })

  it('mention, question, follow_post, repost, first_post, agent_reply carry the snippet in the body', () => {
    expect(pushPayload(job(item({ kind: 'mention', excerpt: '@me 이 부분요' })), t)).toMatchObject({
      title: '@dawn님이 글에서 나를 언급했어요',
      body: '@me 이 부분요',
    })
    expect(pushPayload(job(item({ kind: 'question', category: 'following', excerpt: '이거 어떻게 쓰세요?' })), t)).toMatchObject({
      title: '@dawn님이 질문했어요',
      body: '이거 어떻게 쓰세요?',
    })
    expect(pushPayload(job(item({ kind: 'follow_post', category: 'following', excerpt: '오늘 쓴 글', count: 2 })), t).title).toBe('@dawn님이 새 글 2개를 올렸어요')
    expect(pushPayload(job(item({ kind: 'repost', category: 'likes', excerpt: '원글 미리보기' })), t).body).toBe('원글 미리보기')
    expect(pushPayload(job(item({ kind: 'first_post', category: 'newcomers', excerpt: '첫 글이에요' })), t).body).toBe('첫 글이에요')
    expect(pushPayload(job(item({ kind: 'agent_reply', category: 'agents', targetKind: 'agora', excerpt: '멋진 리뷰', actor: { kind: 'agent', id: 'a1', name: '리서치봇', handle: null, avatarUrl: null } })), t).title)
      .toBe('리서치봇님이 내 AI의 아고라 글에 답글을 남겼어요')
  })

  it('likes, follows and moim reminders stay title-only when there is no excerpt', () => {
    expect(pushPayload(job(item({ kind: 'like', category: 'likes', excerpt: null })), t)).toMatchObject({
      title: '@dawn님이 내 글을 좋아해요',
      body: '',
    })
    expect(pushPayload(job(item({ kind: 'follow', category: 'social', link: '/members/m2', excerpt: null, targetKind: 'member' })), t).body).toBe('')
    expect(pushPayload(job(item({ kind: 'moim_tomorrow', category: 'meetups', excerpt: '판교 저녁 모임', link: '/moim/x', targetKind: 'moim' })), t)).toMatchObject({
      title: '내일 모임이 있어요',
      body: '판교 저녁 모임',
    })
  })

  it('pushActorName never returns an @handle for anon or someone', () => {
    expect(pushActorName(item({ kind: 'comment', targetKind: 'anon', actor: { kind: 'anon', id: null, name: '감춰진이름', handle: 'hidden', avatarUrl: null } }), t)).toBe('누군가')
    expect(pushActorName(item({ kind: 'like', actor: { kind: 'someone', id: null, name: null, avatarUrl: null } }), t)).toBe('누군가')
    expect(pushActorName(item({ kind: 'comment' }), t)).toBe('@dawn')
  })
})
