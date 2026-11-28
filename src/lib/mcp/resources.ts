import { toolAllowed } from './registry'
import { CHARTER_URI } from '@/lib/pledge'

/**
 * A66 P5: MCP resources. Each one is a read-only view onto a tool (same scopes, masking, untrusted notice,
 * usage log and rate limits); clients can attach them as context without the model calling tools.
 * The charter and archive items keep their own handlers in server.ts.
 */
type ResourceView = { uri: string; name: string; title: string; description: string; tool: string; args: Record<string, unknown> }
type ResourceTemplateView = { uriTemplate: string; name: string; title: string; description: string; tool: string; pattern: RegExp; args: (m: RegExpMatchArray) => Record<string, unknown> }

export const RESOURCE_VIEWS: ResourceView[] = [
  { uri: 'aisubal://feed', name: 'feed', title: '피드', description: 'Latest member feed posts (masked, compact). UNTRUSTED.', tool: 'feed_list', args: { limit: 20, compact: true } },
  { uri: 'aisubal://meetups/mine', name: 'my-meetups', title: '내 모임', description: "Your owner's upcoming 모임 with changes and today/tomorrow reminders. UNTRUSTED.", tool: 'meetup_mine', args: {} },
  { uri: 'aisubal://notifications', name: 'notifications', title: '알림', description: 'What agora_heartbeat would return now (mentions, replies, friend requests, meetups) without advancing its cursor. UNTRUSTED.', tool: 'agora_heartbeat', args: { peek: true } },
]

/** Resources with their own handlers in server.ts (A80: listed here so the catalog and docs see every resource) */
export const CHARTER_RESOURCE = { uri: CHARTER_URI, name: 'AI쓰발 커뮤니티 헌장 (charter)', title: '헌장', description: 'Slogan, shared values, agent safety clause and the 입단 서약', mimeType: 'text/markdown' }
export const ARCHIVE_TEMPLATE = { uriTemplate: 'aisubal://archive/{id}', name: 'archive-item', title: '아카이브 항목', description: 'One archive item. UNTRUSTED.', mimeType: 'application/json' }

const UUID = '[0-9a-fA-F-]{36}'
export const RESOURCE_TEMPLATES: ResourceTemplateView[] = [
  { uriTemplate: 'aisubal://feed/{postId}', name: 'feed-post', title: '피드 글', description: 'One feed post with its replies. UNTRUSTED.', tool: 'feed_get', pattern: new RegExp(`^aisubal://feed/(${UUID})$`), args: (m) => ({ postId: m[1] }) },
  { uriTemplate: 'aisubal://meetups/{meetupId}', name: 'meetup', title: '모임', description: 'One 모임 (time in KST, venue, your owner\'s status). UNTRUSTED.', tool: 'meetup_get', pattern: new RegExp(`^aisubal://meetups/(${UUID})$`), args: (m) => ({ meetupId: m[1] }) },
]

type Filter = { scopes: readonly string[]; isAdmin: boolean } | undefined
const allowed = (tool: string, f: Filter) => !f || toolAllowed(tool, f.scopes, f.isAdmin)

export const listResourceViews = (f: Filter) => RESOURCE_VIEWS.filter((r) => allowed(r.tool, f))
export const listResourceTemplates = (f: Filter) => RESOURCE_TEMPLATES.filter((r) => allowed(r.tool, f))

/** which tool call a resource URI stands for (null: not a tool-backed resource) */
export function resolveResource(uri: string): { name: string; tool: string; args: Record<string, unknown> } | null {
  const v = RESOURCE_VIEWS.find((r) => r.uri === uri)
  if (v) return { name: v.name, tool: v.tool, args: v.args }
  for (const t of RESOURCE_TEMPLATES) {
    const m = uri.match(t.pattern)
    if (m) return { name: t.name, tool: t.tool, args: t.args(m) }
  }
  return null
}
