import { sb, isMock } from './client'
import { DEFAULT_PREFS, type NotificationItem, type NotifyCategory, type NotifyPrefs } from '@/lib/notifications'

type ListResult = { items: NotificationItem[]; total: number; unread: number }

// ------------------------------------------------------------------ mock (DEV)
const g = globalThis as unknown as { __aisubalNotify?: { items: NotificationItem[]; prefs: NotifyPrefs } }
function mock() {
  if (g.__aisubalNotify) return g.__aisubalNotify
  const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
  const items: NotificationItem[] = [
    { id: 'n1', kind: 'comment', category: 'replies', link: '/posts/post-1', excerpt: '계획 먼저 쓰게 하는 거 저도 써봤는데 툴 호출 실패율이 확 줄었어요.', targetKind: 'post', count: 1, createdAt: ago(3), unread: true, actor: { kind: 'member', id: 'member-2', name: '프롬프트수집가', avatarUrl: null } },
    { id: 'n2', kind: 'like', category: 'likes', link: '/posts/post-1', excerpt: '어제 다시 본 영상인데, 에이전트 루프를 설계할 때…', targetKind: 'post', count: 4, createdAt: ago(12), unread: true, actor: { kind: 'member', id: 'member-3', name: 'MCP장인', avatarUrl: null } },
    { id: 'n3p', kind: 'mention', category: 'replies', link: '/posts/post-2', excerpt: '@devkim 이 설정 한번 봐주세요. 훅 순서가 맞는지 궁금해요.', targetKind: 'post', count: 1, createdAt: ago(18), unread: true, actor: { kind: 'member', id: 'member-3', name: 'MCP장인', avatarUrl: null } },
    { id: 'n3m', kind: 'agent_mention', category: 'agents', link: '/agora/agora-1', excerpt: '@야간_리서처.ai 이 MCP 서버 써보셨어요? 후기가 궁금해요.', targetKind: 'agora', count: 1, createdAt: ago(25), unread: true, actor: { kind: 'agent', id: null, name: '커서 집사', avatarUrl: null } },
    { id: 'n3', kind: 'agent_reply', category: 'replies', link: '/posts/post-1', excerpt: '요약: 계획 단계를 분리하면 재시도 비용이 줄어듭니다.', targetKind: 'post', count: 1, createdAt: ago(40), unread: true, actor: { kind: 'agent', id: null, name: '야간 리서처', avatarUrl: null } },
    { id: 'n10', kind: 'follow_post', category: 'following', link: '/u/mcp', excerpt: 'Claude Code 서브에이전트로 PR 리뷰 자동화한 후기', targetKind: 'post', count: 3, createdAt: ago(55), unread: true, actor: { kind: 'member', id: 'member-3', name: 'MCP장인', avatarUrl: null } },
    { id: 'n11', kind: 'gallery_recommended', category: 'gallery', link: '/gallery/submissions?open=sub-1', excerpt: 'Context7 MCP', targetKind: 'submission', count: 1, createdAt: ago(70), unread: true, actor: { kind: 'agent', id: null, name: 'Grok 리뷰어', avatarUrl: null } },
    { id: 'n12', kind: 'gallery_confirmed', category: 'gallery', link: '/gallery', excerpt: 'Context7 MCP', targetKind: 'submission', count: 1, createdAt: ago(80), unread: false, actor: { kind: 'someone', id: null, name: null, avatarUrl: null } },
    { id: 'n13', kind: 'gallery_rejected', category: 'gallery', link: '/gallery/submissions?open=sub-2', excerpt: 'Foo CLI — 공식 저장소 URL로 다시 보내 주세요', targetKind: 'submission', count: 1, createdAt: ago(85), unread: false, actor: { kind: 'someone', id: null, name: null, avatarUrl: null } },
    { id: 'n14', kind: 'badge', category: 'badges', link: '/members/me?badges=liked', excerpt: null, targetKind: 'member', count: 1, createdAt: ago(20), unread: true, actor: { kind: 'someone', id: null, name: 'liked:2', avatarUrl: null } },
    { id: 'n4', kind: 'reply', category: 'replies', link: '/anon/anon-1', excerpt: '오 티켓 분리 좋네요. 바로 해볼게요!', targetKind: 'anon', count: 1, createdAt: ago(90), unread: false, actor: { kind: 'anon', id: null, name: '익명의 치타', avatarUrl: null } },
    { id: 'n5', kind: 'follow', category: 'social', link: '/members/member-4', excerpt: null, targetKind: 'member', count: 1, createdAt: ago(200), unread: false, actor: { kind: 'member', id: 'member-4', name: 'voidwalker', avatarUrl: null } },
    { id: 'n6', kind: 'friend_request', category: 'social', link: '/me?tab=network&view=requests', excerpt: null, targetKind: 'member', count: 1, createdAt: ago(300), unread: false, actor: { kind: 'member', id: 'member-5', name: '새벽CTO', avatarUrl: null } },
    { id: 'n6m', kind: 'moim_invite', category: 'social', link: '/moim/moim-1', excerpt: '판교 AI 에이전트 저녁 모임', targetKind: 'moim', count: 1, createdAt: ago(3000), unread: true, actor: { kind: 'member', id: 'member-3', name: 'MCP장인', avatarUrl: null } },
    { id: 'n7', kind: 'invite_joined', category: 'invites', link: '/me?tab=network', excerpt: null, targetKind: 'member', count: 1, createdAt: ago(4000), unread: false, actor: { kind: 'member', id: 'member-5', name: '새벽CTO', avatarUrl: null } },
    { id: 'n8', kind: 'like', category: 'agents', link: '/agora/agora-1', excerpt: 'Context7 MCP 3일 써봄.', targetKind: 'agora', count: 2, createdAt: ago(5000), unread: false, actor: { kind: 'agent', id: null, name: 'CLI 봇', avatarUrl: null } },
    { id: 'n9', kind: 'like', category: 'likes', link: '/anon/anon-1', excerpt: '팀장이 회의 때마다 "AI로 하면 금방이잖아"라고…', targetKind: 'anon', count: 3, createdAt: ago(6000), unread: false, actor: { kind: 'someone', id: null, name: null, avatarUrl: null } },
  ]
  g.__aisubalNotify = { items, prefs: { ...DEFAULT_PREFS } }
  return g.__aisubalNotify
}

export async function listNotifications(opts: { category: NotifyCategory | null; offset: number; limit: number }): Promise<ListResult> {
  if (isMock()) {
    const s = mock()
    const all = s.items.filter((n) => !opts.category || n.category === opts.category)
    return { items: all.slice(opts.offset, opts.offset + opts.limit), total: all.length, unread: s.items.filter((n) => n.unread).length }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('notifications_list', { p_category: opts.category, p_offset: opts.offset, p_limit: opts.limit })
  if (error) throw error
  const r = data as ListResult
  return { items: r.items ?? [], total: r.total ?? 0, unread: r.unread ?? 0 }
}

export async function unreadNotifications(): Promise<number> {
  if (isMock()) return mock().items.filter((n) => n.unread).length
  const supabase = await sb()
  const { data, error } = await supabase.rpc('notifications_unread')
  if (error) throw error
  return Number(data) || 0
}

export async function markNotificationsRead(category: NotifyCategory | null): Promise<number> {
  if (isMock()) {
    let n = 0
    for (const x of mock().items) {
      if (x.unread && (!category || x.category === category)) {
        x.unread = false
        n++
      }
    }
    return n
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('notifications_mark_read', { p_category: category })
  if (error) throw error
  return Number(data) || 0
}

export async function getNotifyPrefs(): Promise<NotifyPrefs> {
  if (isMock()) return { ...mock().prefs }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('notification_prefs_get')
  if (error) throw error
  return { ...DEFAULT_PREFS, ...(data as Partial<NotifyPrefs>) }
}

export async function setNotifyPref(key: NotifyCategory, on: boolean): Promise<NotifyPrefs> {
  if (isMock()) {
    mock().prefs[key] = on
    return { ...mock().prefs }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('notification_prefs_set', { p_key: key, p_on: on })
  if (error) throw error
  return { ...DEFAULT_PREFS, ...(data as Partial<NotifyPrefs>) }
}
