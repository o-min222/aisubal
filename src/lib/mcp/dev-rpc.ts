/**
 * A148: the dev server's (mock data) stand-in for the token-verified Supabase RPCs behind MCP tools.
 * It never opens a network connection: a local MCP client must never read or write the production
 * database, even when it carries a real token. RPCs without a mock answer with a clear error.
 */
import { getAgentProfile } from '@/lib/data/agent-profiles'
import { getAgentCaps } from '@/lib/data/agent-caps'
import { getFeedThread, listFeedPage } from '@/lib/data/feed'
import { mockAgentForToken } from '@/lib/data/tokens'
import type { TimelinePost } from '@/components/timeline/types'
import type { Rpc } from './dispatch'

const DEV_VIEWER = 'dev-user-id'

export const DEV_RPC_NO_MOCK = 'local_mock_only'

function feedRow(p: TimelinePost) {
  const kind = p.author.kind === 'agent' ? 'agent' : 'real'
  return {
    id: p.id,
    parent_id: p.parentId,
    root_id: p.rootId,
    reply_to_id: p.replyToId ?? null,
    author: { kind, id: p.author.id, name: p.author.name },
    title: p.title ?? null,
    body: p.body,
    url: p.linkUrl,
    link_title: null,
    link_description: null,
    agent_interaction: 'agents_allowed' as const,
    deleted: p.isDeleted === true,
    edited: p.isEdited === true,
    like_count: p.likeCount,
    reply_count: p.replyCount,
    created_at: p.createdAt,
  }
}

const ok = (data: unknown) => ({ data, error: null })

export const devRpc: Rpc = async (fn, args) => {
  const token = typeof args.p_token === 'string' ? args.p_token : null
  switch (fn) {
    case 'agent_caps':
      return ok(await getAgentCaps())
    case 'mcp_agent_profile_get': {
      const me = mockAgentForToken(token)
      const id = typeof args.p_id === 'string' && args.p_id ? args.p_id : me.id
      // a token made on this dev server is not in the seeded profiles: answer with its own minimal card
      const p = (await getAgentProfile(DEV_VIEWER, id)) ?? (id === me.id ? { id, name: me.name, isOwner: true, owner: { id: DEV_VIEWER, name: '나' } } : null)
      if (!p) return { data: null, error: { message: 'api_not_found' } }
      return ok({ ...p, isMe: id === me.id, page: `/agents/${id}` })
    }
    case 'mcp_feed_list': {
      const q = typeof args.p_query === 'string' ? args.p_query.toLowerCase() : ''
      const limit = typeof args.p_limit === 'number' ? args.p_limit : 20
      const { posts } = await listFeedPage(DEV_VIEWER, { scope: 'all', page: 1, pageSize: 50 })
      return ok(posts.filter((p) => !q || `${p.title ?? ''} ${p.body}`.toLowerCase().includes(q)).slice(0, limit).map(feedRow))
    }
    case 'mcp_feed_get': {
      const t = typeof args.p_post_id === 'string' ? await getFeedThread(args.p_post_id, DEV_VIEWER) : null
      if (!t) return { data: null, error: { message: 'api_not_found' } }
      return ok({ post: feedRow(t.root), assets: [], replies: t.replies.map(feedRow) })
    }
    default:
      return { data: null, error: { message: `${DEV_RPC_NO_MOCK}: ${fn} has no mock on the local dev server (production runs the token-verified RPC).` } }
  }
}
