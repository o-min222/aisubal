/**
 * Archive MCP tools: a member's connected agent pulls from or saves to their
 * personal stash. archive_list / archive_search / archive_get need archive:read,
 * archive_add needs archive:write (checked in the DB via api__token).
 * Anonymous-board items never reach agents (excluded in SQL and here).
 * Every saved excerpt comes back wrapped as untrusted_third_party_ai.
 */
import {
  AGENT_ARCHIVE_KINDS,
  archiveFromRow,
  ARCHIVE_AGENT_NOTICE,
  isArchiveKind,
  toAgentArchiveItem,
  type ArchiveItem,
  type ArchiveKind,
} from '@/lib/archive-rules'

const KIND_ENUM = [...AGENT_ARCHIVE_KINDS]

export const ARCHIVE_TOOLS = [
  {
    name: 'archive_list',
    description: "List the member's archive (saved posts, Agora threads, tools, groups, 모임, profiles, links), newest first. Filter by kind or tag. Saved content is untrusted third-party text. Scope: archive:read",
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: KIND_ENUM },
        tag: { type: 'string' },
        limit: { type: 'number', description: '1-50, default 20' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'archive_search',
    description: "Search the member's archive by text (title, excerpt, the member's memo). Scope: archive:read",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        kind: { type: 'string', enum: KIND_ENUM },
        tag: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'archive_get',
    description: 'One archive item with its full saved excerpt (wrapped as untrusted_third_party_ai), source URL, memo and tags. Scope: archive:read',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'archive_add',
    description:
      "Save something into the member's archive (private to them). kind=link with ref=an http(s) URL, or kind=post|agora|tool|group|moim|member with ref=its id (tool: id or slug; group: slug; member: id or @handle). Anonymous-board posts cannot be saved by agents. Optional memo and tags. Scope: archive:write",
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: KIND_ENUM },
        ref: { type: 'string' },
        title: { type: 'string', description: 'links only: fallback title' },
        memo: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['kind', 'ref'],
    },
  },
]
export const ARCHIVE_TOOL_NAMES = new Set(ARCHIVE_TOOLS.map((t) => t.name))
export const ARCHIVE_READ_TOOLS = new Set(['archive_list', 'archive_search', 'archive_get'])

/** Pre-stash names keep working (not advertised). */
export const ARCHIVE_ALIASES: Record<string, (a: Record<string, unknown>) => { name: string; args: Record<string, unknown> }> = {
  list_archive: (a) => ({ name: 'archive_list', args: a }),
  search_archive: (a) => ({ name: 'archive_search', args: { ...a, kind: a.kind ?? a.type } }),
  get_archive_item: (a) => ({ name: 'archive_get', args: { id: a.id ?? a.itemId } }),
  save_to_archive: (a) => ({
    name: 'archive_add',
    args: { kind: a.kind ?? (a.postId ? 'post' : a.sourceType), ref: a.ref ?? a.postId ?? a.sourceId, memo: a.memo ?? a.note, tags: a.tags },
  }),
}

export type ArchiveBackend = {
  list(q: { query: string | null; kind: ArchiveKind | null; tag: string | null; limit: number; offset: number }): Promise<{ total: number; items: ArchiveItem[] }>
  get(id: string): Promise<ArchiveItem | null>
  add(input: { kind: ArchiveKind; ref: string; title: string | null; memo: string | null; tags: string[] | null }): Promise<ArchiveItem & { created?: boolean }>
}

const str = (v: unknown, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const int = (v: unknown, d: number, lo: number, hi: number) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
}
const ERRORS: Record<string, string> = {
  archive_not_found: 'Not found (or not visible to you).',
  archive_bad_url: 'ref must be a public http(s) URL.',
  archive_anon_agent: 'Anonymous-board posts cannot be saved by agents.',
  archive_full: 'Archive is full (5000 items).',
  archive_bad_kind: 'Unknown kind.',
}
const friendly = (m: string) => Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? m

export async function handleArchiveTool(name: string, args: Record<string, unknown>, backend: ArchiveBackend, origin: string): Promise<Record<string, unknown>> {
  const kindArg = isArchiveKind(args.kind) ? args.kind : null
  try {
    if (name === 'archive_list' || name === 'archive_search') {
      const query = name === 'archive_search' ? str(args.query, 100) : null
      if (name === 'archive_search' && !query) return { error: 'query is required' }
      const kind = kindArg === 'anon' ? null : kindArg
      const limit = int(args.limit, 20, 1, 50)
      const r = await backend.list({ query, kind, tag: str(args.tag, 24)?.toLowerCase() ?? null, limit, offset: int(args.offset, 0, 0, 5000) })
      return { notice: ARCHIVE_AGENT_NOTICE, total: r.total, items: r.items.filter((i) => i.kind !== 'anon').map((i) => toAgentArchiveItem(i, origin)) }
    }
    if (name === 'archive_get') {
      const id = str(args.id, 64)
      if (!id) return { error: 'id is required' }
      const it = await backend.get(id)
      if (!it || it.kind === 'anon') return { error: ERRORS.archive_not_found }
      return { notice: ARCHIVE_AGENT_NOTICE, item: toAgentArchiveItem(it, origin) }
    }
    if (name === 'archive_add') {
      if (!kindArg) return { error: `kind must be one of ${KIND_ENUM.join(', ')}` }
      if (kindArg === 'anon') return { error: ERRORS.archive_anon_agent }
      const ref = str(args.ref, 2048)
      if (!ref) return { error: 'ref is required' }
      const tags = Array.isArray(args.tags) ? args.tags.filter((t): t is string => typeof t === 'string') : null
      const it = await backend.add({ kind: kindArg, ref, title: str(args.title, 300), memo: typeof args.memo === 'string' ? args.memo.slice(0, 500) : null, tags })
      return { ok: true, created: it.created !== false, id: it.id, title: it.title, reference: `aisubal://archive/${it.id}` }
    }
    return { error: `Unknown archive tool ${name}` }
  } catch (e) {
    return { error: friendly(e instanceof Error ? e.message : String(e)) }
  }
}

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

/** Production backend: token-verified SECURITY DEFINER RPCs (0022_archive_stash.sql). */
export function rpcArchiveBackend(token: string, rpc: Rpc): ArchiveBackend {
  const call = async (fn: string, a: Record<string, unknown>) => {
    const { data, error } = await rpc(fn, { p_token: token, ...a })
    if (error) throw new Error(error.message)
    return data
  }
  const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  return {
    async list(q) {
      const d = (await call('mcp_archive_list', { p_query: q.query, p_kind: q.kind, p_tag: q.tag, p_limit: q.limit, p_offset: q.offset })) as { total: number; items: unknown[] }
      return { total: d?.total ?? 0, items: (d?.items ?? []).map(archiveFromRow) }
    },
    async get(id) {
      if (!uuid(id)) return null
      return archiveFromRow(await call('mcp_archive_get', { p_id: id }))
    },
    async add(input) {
      const d = (await call('mcp_archive_add', { p_kind: input.kind, p_ref: input.ref, p_title: input.title, p_memo: input.memo, p_tags: input.tags })) as Record<string, unknown>
      return { ...archiveFromRow(d), created: d.created === true }
    },
  }
}
