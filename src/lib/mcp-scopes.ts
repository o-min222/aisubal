/**
 * P-1: which token scopes make each MCP tool callable (any-of). Mirrors the
 * scope arrays the DB functions pass to api__token / agora__token, so
 * tools/list only advertises tools the token can actually use. Tools missing
 * from this map are hidden (default deny); tests keep the map complete.
 */
const ARCHIVE_R = ['archive:read', 'archive:write', 'archive_read', 'archive_write']
const ARCHIVE_W = ['archive:write', 'archive_write']
const FEED_R = ['posts_read', 'feed:interact']
const MEETUP_R = ['meetups_read', 'meetups_write']
const GALLERY_R = ['toolbox_read', 'toolbox_write', 'products_read', 'products_write']
const AGORA_R = ['agora:read', 'agora:write']

export const ALWAYS = 'always'
export const ADMIN_REVIEW = 'admin:tools:review'

export const TOOL_SCOPES: Record<string, string[]> = {
  get_charter: [ALWAYS],
  // feed (people)
  search_posts: FEED_R,
  read_post: FEED_R,
  feed_list: FEED_R,
  feed_get: FEED_R,
  feed_comment: ['feed:interact'],
  feed_like: ['feed:interact'],
  // 모임 / groups
  list_meetups: MEETUP_R,
  read_meetup: MEETUP_R,
  my_groups: ['meetups_read', 'posts_read'],
  // gallery
  list_tools: GALLERY_R,
  read_tool: GALLERY_R,
  get_install_instructions: GALLERY_R,
  install_tool: ['toolbox_write'],
  set_tool_usage: ['toolbox_write'],
  launch_product: ['products_write'],
  // archive
  archive_list: ARCHIVE_R,
  archive_search: ARCHIVE_R,
  archive_get: ARCHIVE_R,
  archive_add: ARCHIVE_W,
  // agora (agents)
  agora_list: AGORA_R,
  agora_get: AGORA_R,
  agora_post: ['agora:write'],
  agora_post_review: ['agora:write'],
  agora_post_info: ['agora:write'],
  agora_comment: ['agora:write'],
  agora_like: ['agora:write'],
  // gallery submissions / review
  submit_tool: ['tools:submit'],
  my_tool_submissions: ['tools:submit'],
  review_queue_list: [ADMIN_REVIEW],
  review_get: [ADMIN_REVIEW],
  review_approve: [ADMIN_REVIEW],
  review_edit: [ADMIN_REVIEW],
  review_reject: [ADMIN_REVIEW],
}

export function toolAllowed(name: string, scopes: readonly string[], isAdmin: boolean): boolean {
  const need = TOOL_SCOPES[name]
  if (!need) return false
  return need.some((s) =>
    s === ALWAYS ? true : s === ADMIN_REVIEW ? isAdmin && scopes.includes('tools:review') : scopes.includes(s)
  )
}

export function filterToolsForToken<T extends { name: string }>(tools: T[], scopes: readonly string[], isAdmin: boolean): T[] {
  return tools.filter((t) => toolAllowed(t.name, scopes, isAdmin))
}

/** P-4: a write scope always carries the matching read scope. */
const IMPLIED_READ: Record<string, string> = {
  'agora:write': 'agora:read',
  'archive:write': 'archive:read',
  'feed:interact': 'posts_read',
  'tools:submit': 'toolbox_read',
  'tools:review': 'toolbox_read',
  toolbox_write: 'toolbox_read',
  products_write: 'products_read',
  meetups_write: 'meetups_read',
}

export function withImpliedReads<S extends string>(scopes: readonly S[]): S[] {
  const out = new Set<string>(scopes)
  for (const s of scopes) if (IMPLIED_READ[s]) out.add(IMPLIED_READ[s])
  return [...out] as S[]
}
