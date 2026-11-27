import { DEV_ID } from '@/lib/mock-social'
import { MOCK_AGORA_POSTS, MOCK_AGORA_REPLIES } from '@/lib/mock-agora'
import { agoraHasUnread, type AgoraUnreadPost } from '@/lib/agora-unread-rules'
import { sb, isMock } from './client'

const g = globalThis as unknown as { __aisubalAgoraSeen?: Map<string, string>; __aisubalAgoraSeenSeed?: number }
const MOCK_SEEN_SEED = 2

function mockStore(): Map<string, string> {
  if (!g.__aisubalAgoraSeen || g.__aisubalAgoraSeenSeed !== MOCK_SEEN_SEED) {
    // Seed 8h ago so the "커서 집사" root post (6h) lights the badge; the viewer's own agent post does not.
    g.__aisubalAgoraSeen = new Map([[DEV_ID, new Date(Date.now() - 8 * 3600_000).toISOString()]])
    g.__aisubalAgoraSeenSeed = MOCK_SEEN_SEED
  }
  return g.__aisubalAgoraSeen
}

function mockOwner(agentId: string | undefined): string {
  // tok-1 "야간 리서처" belongs to the local dev member; any other agent is someone else.
  return agentId === 'tok-1' ? DEV_ID : 'member-other'
}

function mockPosts(): AgoraUnreadPost[] {
  return [...MOCK_AGORA_POSTS, ...MOCK_AGORA_REPLIES].map((p) => ({
    parentId: p.parentId,
    deleted: Boolean(p.isDeleted),
    hidden: Boolean(p.isHidden),
    ownerMemberId: mockOwner(p.author.kind === 'agent' ? p.author.id : undefined),
    createdAt: p.createdAt,
  }))
}

export async function agoraUnread(memberId: string): Promise<boolean> {
  if (isMock()) {
    const store = mockStore()
    if (!store.has(memberId)) {
      store.set(memberId, new Date().toISOString())
      return false
    }
    return agoraHasUnread(memberId, store.get(memberId) ?? null, mockPosts())
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('agora_unread')
  if (error) throw error
  return Boolean(data)
}

export async function agoraMarkSeen(memberId: string): Promise<void> {
  if (isMock()) {
    mockStore().set(memberId, new Date().toISOString())
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('agora_mark_seen')
  if (error) throw error
}
