import type { Member } from '@/lib/supabase/types'
import {
  ARCHIVE_KINDS,
  ARCHIVE_PAGE_SIZE,
  archiveKey,
  archiveFromRow,
  cleanTags,
  type ArchiveItem,
  type ArchiveKind,
} from '@/lib/archive-rules'
import { fetchLinkPreview } from '@/lib/link-preview-server'
import { checkFetchUrl } from '@/lib/safe-fetch'
import { sb, useMockData as isMock } from './client'

const fromRow = archiveFromRow

const COLS = 'id, ref_no, kind, ref, title, excerpt, source_url, author_label, author_kind, image_url, memo, tags, source_created_at, created_at, updated_at'

// ------------------------------------------------------------------ DEV mock store
type MockStore = Map<string, ArchiveItem[]>
const g = globalThis as unknown as { __aisubalArchive?: MockStore; __aisubalArchiveSeq?: Map<string, number> }
const store = (): MockStore => (g.__aisubalArchive ??= new Map())
const nextRef = (memberId: string) => {
  const m = (g.__aisubalArchiveSeq ??= new Map())
  const n = (m.get(memberId) ?? 0) + 1
  m.set(memberId, n)
  return n
}
function mockItems(memberId: string): ArchiveItem[] {
  if (!store().has(memberId)) {
    const now = Date.now()
    const at = (h: number) => new Date(now - h * 3600_000).toISOString()
    const seed: Array<Partial<ArchiveItem> & Pick<ArchiveItem, 'kind' | 'ref' | 'title'>> = [
      { kind: 'link', ref: 'https://modelcontextprotocol.io/docs', title: 'Model Context Protocol 문서', excerpt: 'MCP lets you build servers that expose data and functionality to LLM applications in a secure, standardized way.', sourceUrl: 'https://modelcontextprotocol.io/docs', authorKind: 'site', memo: '서버 만들 때 다시 보기', tags: ['mcp', 'docs'] },
      { kind: 'post', ref: 'post-1', title: '어제 다시 본 영상인데, 에이전트 루프를 설계할 때', excerpt: '우리 Cursor 워크플로에도 그대로 이식해 볼 만해요. 계획 → 실행 → 검증 루프를 짧게 돌리는 게 핵심.', sourceUrl: '/posts/post-1', authorLabel: '@agentfan', authorKind: 'member', tags: ['agent', 'cursor'] },
      { kind: 'tool', ref: 'tool-1', title: 'Playwright MCP', excerpt: '브라우저 자동화·E2E를 MCP 도구로', sourceUrl: '/gallery/tool-1', authorKind: 'site', memo: 'QA 자동화에 써보기', tags: ['mcp', 'testing'] },
      { kind: 'agora', ref: 'agora-1', title: 'Context7 · Context7 MCP 3일 써봄', excerpt: '라이브러리 최신 문서를 바로 끌어와서 환각이 확 줄었어요. 단, 응답이 길어질 때가 있음.', sourceUrl: '/agora/agora-1', authorLabel: '야간 리서처', authorKind: 'agent', tags: ['mcp'] },
      { kind: 'moim', ref: 'moim-1', title: '성수 프롬프트 엔지니어링 번개', excerpt: '각자 쓰는 시스템 프롬프트를 들고 와서 같이 고쳐봐요.', sourceUrl: '/moim/moim-1', authorLabel: '@dev', authorKind: 'member', tags: ['prompt'] },
      { kind: 'anon', ref: 'anon-1', title: '회사에서 AI 쓰는 거 눈치 보이는 사람?', excerpt: '팀장님은 쓰지 말라는데 다들 몰래 쓰는 분위기…', sourceUrl: '/anon/anon-1', authorKind: 'anon', tags: [] },
    ]
    ;(g.__aisubalArchiveSeq ??= new Map()).set(memberId, seed.length)
    store().set(
      memberId,
      seed.map((s, i) => ({ id: `arc-${i + 1}`, refNo: seed.length - i, excerpt: '', sourceUrl: null, authorLabel: null, authorKind: null, imageUrl: null, memo: '', tags: [], sourceCreatedAt: null, createdAt: at(i * 7 + 1), updatedAt: at(i * 7 + 1), ...s }) as ArchiveItem),
    )
  }
  return store().get(memberId)!
}

// ------------------------------------------------------------------ queries
export type ArchiveQuery = { kind?: ArchiveKind | null; tag?: string | null; q?: string | null; page?: number }
export type ArchivePage = { items: ArchiveItem[]; total: number; page: number; pages: number; kindCounts: Record<string, number>; tags: Array<{ tag: string; count: number }> }

function facet(rows: Array<Pick<ArchiveItem, 'kind' | 'tags'>>) {
  const kindCounts: Record<string, number> = { all: rows.length }
  const tagCounts = new Map<string, number>()
  for (const r of rows) {
    kindCounts[r.kind] = (kindCounts[r.kind] ?? 0) + 1
    for (const t of r.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  }
  const tags = [...tagCounts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, 30)
  return { kindCounts, tags }
}

const refQuery = (q: string | null | undefined) => {
  const m = /^#?a(\d{1,7})$/i.exec(q?.trim() ?? '')
  return m ? Number(m[1]) : null
}

const matches = (it: ArchiveItem, q: ArchiveQuery) => {
  const ref = refQuery(q.q)
  if (ref) return it.refNo === ref
  const needle = q.q?.trim().toLowerCase()
  return (!q.kind || it.kind === q.kind) && (!q.tag || it.tags.includes(q.tag)) && (!needle || [it.title, it.excerpt, it.memo, it.authorLabel ?? ''].some((s) => s.toLowerCase().includes(needle)))
}

export async function listArchive(memberId: string, q: ArchiveQuery = {}): Promise<ArchivePage> {
  const page = Math.max(1, Math.floor(q.page || 1))
  const from = (page - 1) * ARCHIVE_PAGE_SIZE
  if (isMock()) {
    const all = [...mockItems(memberId)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const hits = all.filter((it) => matches(it, q))
    return { items: hits.slice(from, from + ARCHIVE_PAGE_SIZE), total: hits.length, page, pages: Math.max(1, Math.ceil(hits.length / ARCHIVE_PAGE_SIZE)), ...facet(all) }
  }
  const supabase = await sb()
  let query = supabase.from('archive_entries').select(COLS, { count: 'exact' }).eq('owner_id', memberId)
  if (q.kind) query = query.eq('kind', q.kind)
  if (q.tag) query = query.contains('tags', [q.tag])
  const ref = refQuery(q.q)
  const needle = ref ? null : q.q?.trim().replace(/[%,()]/g, ' ').slice(0, 100)
  if (ref) query = query.eq('ref_no', ref)
  if (needle) query = query.or(`title.ilike.%${needle}%,excerpt.ilike.%${needle}%,memo.ilike.%${needle}%`)
  const [{ data, count, error }, facets] = await Promise.all([
    query.order('created_at', { ascending: false }).range(from, from + ARCHIVE_PAGE_SIZE - 1),
    supabase.from('archive_entries').select('kind, tags').eq('owner_id', memberId).limit(5000),
  ])
  if (error) throw new Error(error.message)
  const total = count ?? 0
  return { items: (data ?? []).map(fromRow), total, page, pages: Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE)), ...facet((facets.data ?? []) as Array<Pick<ArchiveItem, 'kind' | 'tags'>>) }
}

/** 'kind:ref' keys of everything this member saved (for the bookmark buttons' state). */
export async function savedArchiveKeys(memberId: string): Promise<string[]> {
  if (isMock()) return mockItems(memberId).map((i) => archiveKey(i.kind, i.ref))
  const supabase = await sb()
  const { data } = await supabase.from('archive_entries').select('kind, ref').eq('owner_id', memberId).limit(5000)
  return (data ?? []).map((r) => archiveKey(r.kind as ArchiveKind, r.ref as string))
}

export async function getArchiveItems(memberId: string, ids: string[]): Promise<ArchiveItem[]> {
  const want = [...new Set(ids)].slice(0, 50)
  if (!want.length) return []
  if (isMock()) return mockItems(memberId).filter((i) => want.includes(i.id))
  const supabase = await sb()
  const { data } = await supabase.from('archive_entries').select(COLS).eq('owner_id', memberId).in('id', want).order('created_at', { ascending: false })
  return (data ?? []).map(fromRow)
}

// ------------------------------------------------------------------ writes
export type AddInput = { kind: ArchiveKind; ref: string; memo?: string | null; tags?: unknown; hint?: { title?: string; excerpt?: string; url?: string; author?: string } }
export type AddResult = { ok: true; item: ArchiveItem; created: boolean } | { ok: false; error: 'not_found' | 'bad_url' | 'full' | 'failed' }

export async function addToArchive(member: Member, input: AddInput): Promise<AddResult> {
  const memo = input.memo == null ? null : String(input.memo).slice(0, 500)
  const tags = input.tags == null ? null : cleanTags(input.tags)
  let ref = String(input.ref || '').trim()
  let title: string | null = null
  let excerpt: string | null = null
  let image: string | null = null
  if (input.kind === 'link') {
    if (!/^https?:\/\//i.test(ref) || !checkFetchUrl(ref).ok) return { ok: false, error: 'bad_url' }
    const p = await fetchLinkPreview(ref).catch(() => null)
    ref = p?.url && /^https?:\/\//i.test(p.url) ? p.url : ref
    title = p?.title ?? null
    excerpt = [p?.description, p?.site_name].filter(Boolean).join('\n\n') || null
    image = p?.image ?? null
  }
  if (isMock()) {
    const list = mockItems(member.id)
    const existing = list.find((i) => i.kind === input.kind && i.ref === ref)
    const now = new Date().toISOString()
    if (existing) {
      if (memo != null) existing.memo = memo
      if (tags != null) existing.tags = tags
      existing.updatedAt = now
      return { ok: true, item: existing, created: false }
    }
    const item: ArchiveItem = {
      id: `arc-${Date.now()}`,
      refNo: nextRef(member.id),
      kind: input.kind,
      ref,
      title: (title ?? input.hint?.title ?? ref).slice(0, 300),
      excerpt: (excerpt ?? input.hint?.excerpt ?? '').slice(0, 4000),
      sourceUrl: input.kind === 'link' ? ref : (input.hint?.url ?? null),
      authorLabel: input.hint?.author ?? null,
      authorKind: input.kind === 'anon' ? 'anon' : input.kind === 'agora' ? 'agent' : input.kind === 'link' || input.kind === 'tool' || input.kind === 'group' ? 'site' : 'member',
      imageUrl: image,
      memo: memo ?? '',
      tags: tags ?? [],
      sourceCreatedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    list.unshift(item)
    return { ok: true, item, created: true }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('archive_add', { p_kind: input.kind, p_ref: ref, p_title: title, p_excerpt: excerpt, p_image: image, p_memo: memo, p_tags: tags })
  if (error) {
    const m = error.message || ''
    return { ok: false, error: m.includes('archive_not_found') ? 'not_found' : m.includes('archive_bad_url') ? 'bad_url' : m.includes('archive_full') ? 'full' : 'failed' }
  }
  const d = data as Record<string, unknown>
  return { ok: true, item: fromRow(d), created: d.created === true }
}

export async function updateArchiveItem(memberId: string, id: string, patch: { memo?: unknown; tags?: unknown }): Promise<ArchiveItem | null> {
  const memo = patch.memo === undefined ? undefined : String(patch.memo ?? '').slice(0, 500)
  const tags = patch.tags === undefined ? undefined : cleanTags(patch.tags)
  if (isMock()) {
    const it = mockItems(memberId).find((i) => i.id === id)
    if (!it) return null
    if (memo !== undefined) it.memo = memo
    if (tags !== undefined) it.tags = tags
    it.updatedAt = new Date().toISOString()
    return it
  }
  const supabase = await sb()
  const { data, error } = await supabase
    .from('archive_entries')
    .update({ ...(memo !== undefined ? { memo } : {}), ...(tags !== undefined ? { tags } : {}), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', memberId)
    .select(COLS)
    .maybeSingle()
  if (error || !data) return null
  return fromRow(data)
}

export async function removeArchiveItems(memberId: string, ids: string[]): Promise<number> {
  const want = [...new Set(ids)].slice(0, 200)
  if (!want.length) return 0
  if (isMock()) {
    const list = mockItems(memberId)
    const before = list.length
    store().set(memberId, list.filter((i) => !want.includes(i.id)))
    return before - store().get(memberId)!.length
  }
  const supabase = await sb()
  const { data } = await supabase.from('archive_entries').delete().eq('owner_id', memberId).in('id', want).select('id')
  return data?.length ?? 0
}

/** Unsave by source (the bookmark button's second tap). */
export async function removeArchiveByRef(memberId: string, kind: ArchiveKind, ref: string): Promise<boolean> {
  if (isMock()) {
    const list = mockItems(memberId)
    store().set(memberId, list.filter((i) => !(i.kind === kind && i.ref === ref)))
    return true
  }
  const supabase = await sb()
  const { error } = await supabase.from('archive_entries').delete().eq('owner_id', memberId).eq('kind', kind).eq('ref', ref)
  return !error
}

/** 'n saved' counts without exposing who (posts' archive_count). */
export async function archiveSaveCounts(kind: ArchiveKind, refs: string[]): Promise<Record<string, number>> {
  if (!refs.length || isMock()) return {}
  const supabase = await sb()
  const { data } = await supabase.rpc('archive_save_counts', { p_kind: kind, p_refs: refs.slice(0, 200) })
  return (data as Record<string, number>) ?? {}
}

export const ARCHIVE_KIND_LIST = ARCHIVE_KINDS

/** Dev-mode backend for the archive MCP tools (session member, mock store). */
export function devArchiveBackend(member: Member): import('@/lib/archive-mcp').ArchiveBackend {
  return {
    async list(q) {
      const all = mockItems(member.id).filter((i) => i.kind !== 'anon' && matches(i, { kind: q.kind, tag: q.tag, q: q.query }))
      return { total: all.length, items: all.slice(q.offset, q.offset + q.limit) }
    },
    async get(id) {
      return mockItems(member.id).find((i) => i.id === id) ?? null
    },
    async getByRef(refNo) {
      return mockItems(member.id).find((i) => i.refNo === refNo) ?? null
    },
    async add(input) {
      const r = await addToArchive(member, { kind: input.kind, ref: input.ref, memo: input.memo, tags: input.tags, hint: input.title ? { title: input.title } : undefined })
      if (!r.ok) throw new Error(`archive_${r.error}`)
      return { ...r.item, created: r.created }
    },
  }
}
