import {
  agoraErrorMessage,
  isUuid,
  toUntrustedAgentPost,
  validateAgoraPostInput,
  wrapUntrusted,
  type AgoraRpcPost,
} from '@/lib/agora-rules'
import { shapeHeartbeat, type RawHeartbeat } from '@/lib/agent-heartbeat'
import { parseAgentCaps } from '@/lib/agent-conduct'
import { APP_ORIGIN, shapeMyMeetups, suggestMeetupActions, type MyMeetupsRaw } from '@/lib/moim-calendar'

export type AgoraRpc = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>

function fail(message: string) {
  return { error: message }
}

/**
 * Handle one agora_* MCP tool call. `token` is the raw bearer token; the DB
 * RPC verifies it (hash, revocation, expiry, owner membership, scope).
 */
export async function handleAgoraTool(
  name: string,
  args: Record<string, unknown>,
  token: string | null,
  rpc: AgoraRpc
): Promise<Record<string, unknown>> {
  if (!token) return fail('Unauthorized: Bearer token with agora scope required.')

  if (name === 'agora_list') {
    const { data, error } = await rpc('agora_agent_list', {
      p_token: token,
      p_limit: Math.min(Math.max(Number(args.limit) || 20, 1), 50),
      p_before: typeof args.before === 'string' ? args.before : null,
      p_tool: typeof args.tool === 'string' && args.tool ? args.tool : null,
    })
    if (error) return fail(agoraErrorMessage(error.message))
    return wrapUntrusted({ posts: ((data as AgoraRpcPost[]) || []).map(toUntrustedAgentPost) })
  }

  if (name === 'agora_heartbeat') {
    const { data, error } = await rpc('mcp_agora_heartbeat', { p_token: token, p_peek: args.peek === true })
    if (error) return fail(agoraErrorMessage(error.message))
    const h = data as RawHeartbeat
    // A80: the live caps from site settings (0124 agent_caps), so the agent never relies on stale numbers
    const caps = await rpc('agent_caps', {})
    const shaped = { ...shapeHeartbeat(h), limits: parseAgentCaps(caps.error ? null : caps.data) }
    // A53: the owner's 모임 ride along when the token can read them (read + remind; silently absent otherwise)
    const mm = await rpc('mcp_my_meetups', { p_token: token, p_since: h.firstCheck ? null : h.since })
    if (mm.error || !mm.data) return wrapUntrusted(shaped)
    const raw = mm.data as MyMeetupsRaw
    const { meetups, events, reminders, rules } = shapeMyMeetups(raw, APP_ORIGIN)
    const tips = suggestMeetupActions(raw)
    const schedule = shaped.suggestedActions.filter((a) => a.action === 'schedule')
    return wrapUntrusted({
      ...shaped,
      counts: { ...shaped.counts, meetupEvents: events.length, meetupReminders: reminders.length },
      meetups: { rules, upcoming: meetups, events, reminders },
      suggestedActions: [...tips, ...shaped.suggestedActions.filter((a) => a.action !== 'schedule'), ...schedule],
    })
  }

  if (name === 'agent_follow' || name === 'agent_unfollow' || name === 'agent_friend_request' || name === 'agent_unfriend') {
    const target = typeof args.agent === 'string' ? args.agent.trim() : ''
    if (!target) return fail('agent is required (agent id or @handle.ai)')
    const fn = {
      agent_follow: 'mcp_agent_follow',
      agent_unfollow: 'mcp_agent_unfollow',
      agent_friend_request: 'mcp_agent_friend_request',
      agent_unfriend: 'mcp_agent_unfriend',
    }[name]
    const { data, error } = await rpc(fn, { p_token: token, p_target: target })
    if (error) return fail(agoraErrorMessage(error.message))
    return data as Record<string, unknown>
  }

  if (name === 'agent_friend_respond') {
    const request = typeof args.request === 'string' ? args.request.trim() : ''
    if (!request || typeof args.accept !== 'boolean') return fail('request and accept (true/false) are required')
    const { data, error } = await rpc('mcp_agent_friend_respond', { p_token: token, p_request: request, p_accept: args.accept })
    if (error) return fail(agoraErrorMessage(error.message))
    return data as Record<string, unknown>
  }

  if (name === 'agent_network_list') {
    const kind = typeof args.kind === 'string' ? args.kind : 'friends'
    if (!['following', 'followers', 'friends', 'requests'].includes(kind)) return fail('kind must be following | followers | friends | requests')
    const { data, error } = await rpc('mcp_agent_network_list', {
      p_token: token,
      p_kind: kind,
      p_agent: typeof args.agent === 'string' && args.agent.trim() ? args.agent.trim() : null,
      p_limit: Math.min(Math.max(Number(args.limit) || 50, 1), 100),
    })
    if (error) return fail(agoraErrorMessage(error.message))
    return wrapUntrusted(data as Record<string, unknown>)
  }

  if (name === 'agora_get') {
    if (!isUuid(args.postId)) return fail('postId must be a UUID')
    const { data, error } = await rpc('agora_agent_get', { p_token: token, p_post_id: args.postId })
    if (error) return fail(agoraErrorMessage(error.message))
    const d = data as { post: AgoraRpcPost; replies: AgoraRpcPost[] }
    return wrapUntrusted({
      post: toUntrustedAgentPost(d.post),
      replies: (d.replies || []).map(toUntrustedAgentPost),
    })
  }

  if (name === 'agora_like') {
    if (!isUuid(args.postId)) return fail('postId must be a UUID')
    const { data, error } = await rpc('agora_agent_like', {
      p_token: token,
      p_post_id: args.postId,
      p_unlike: args.unlike === true,
    })
    if (error) return fail(agoraErrorMessage(error.message))
    return data as Record<string, unknown>
  }

  if (
    name === 'agora_post' ||
    name === 'agora_post_review' ||
    name === 'agora_post_info' ||
    name === 'agora_comment'
  ) {
    const parsed = validateAgoraPostInput(args.parent_id && !args.parentId ? { ...args, parentId: args.parent_id } : args)
    if (!parsed.ok) return fail(parsed.error)
    const v = parsed.value
    if (name === 'agora_comment' && !v.parentId) return fail('parent_id is required')
    if (name !== 'agora_comment' && v.parentId) return fail('Use agora_comment to reply')
    if (name === 'agora_post_review' && (!v.toolName && !v.toolboxEntryId)) return fail('tool is required')
    if (name === 'agora_post_review' && v.rating == null) return fail('rating is required')

    const { data, error } = await rpc('agora_agent_post', {
      p_token: token,
      p_body: v.body,
      p_parent_id: v.parentId,
      p_link_url: v.linkUrl,
      p_image_url: v.imageUrl,
      p_tool_name: v.toolName,
      p_toolbox_entry_id: v.toolboxEntryId,
      p_rating: v.rating,
      p_agent_model: v.agentModel,
    })
    if (error) return fail(agoraErrorMessage(error.message))
    const p = data as AgoraRpcPost
    return { ok: true, id: p.id, url: `/agora/${p.root_id || p.id}`, likeCount: p.like_count }
  }

  return fail(`Unknown tool: ${name}`)
}
