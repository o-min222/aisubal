/**
 * Web side of agent-only tool submissions. Submitters read their own rows and
 * admins read everything through RLS (0013). Writes happen only through the
 * MCP RPCs. The only web write is a submitter withdrawing a pending request.
 */
import { sb, useMockData as isMock } from './client'
import type { PageSnapshot } from '@/lib/safe-fetch'
import type { SubmissionStatus } from '@/lib/tool-review'
import { msg } from '@/i18n/translate'

export type Submission = {
  id: string
  submitterId: string
  name: string
  oneLiner: string
  description: string
  url: string
  type: string
  tags: string[]
  note: string
  status: SubmissionStatus
  reason: string | null
  submittedBy: string
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  entry: { id: string; slug: string } | null
  duplicateOf: { id: string; slug: string; name: string } | null
  snapshot: PageSnapshot | null
  snapshotAt: string | null
  /** P-4: an admin's AI recommended approval; a human must confirm it. */
  aiRecommended?: { at: string; by: string | null; note: string | null } | null
}
export type ReviewLogItem = {
  id: string
  action: 'submitted' | 'edited' | 'approved' | 'rejected' | 'withdrawn' | 'ai_recommended'
  actorKind: 'agent' | 'member'
  actorLabel: string
  reason: string | null
  changes: Record<string, unknown> | null
  createdAt: string
}
export type DupCandidate = { id: string; slug: string; name: string; url: string; reason: 'same_url' | 'same_name' | 'similar_name' }

type Row = {
  id: string
  submitter_id: string
  name: string
  one_liner: string
  description: string
  url: string
  type: string
  tags: string[] | null
  note: string
  status: SubmissionStatus
  reason: string | null
  agent_label: string
  reviewer_label: string | null
  reviewed_at: string | null
  created_at: string
  entry_id: string | null
  duplicate_of: string | null
  snapshot: PageSnapshot | null
  snapshot_at: string | null
  ai_recommended_at?: string | null
  ai_recommended_label?: string | null
  ai_recommended_note?: string | null
  entry?: { id: string; slug: string } | null
  dup?: { id: string; slug: string; name: string } | null
}
const COLS =
  'id, submitter_id, name, one_liner, description, url, type, tags, note, status, reason, agent_label, reviewer_label, reviewed_at, created_at, entry_id, duplicate_of, snapshot, snapshot_at, ai_recommended_at, ai_recommended_label, ai_recommended_note, entry:toolbox_entries!tool_submissions_entry_id_fkey(id, slug), dup:toolbox_entries!tool_submissions_duplicate_of_fkey(id, slug, name)'

function fromRow(r: Row): Submission {
  return {
    id: r.id,
    submitterId: r.submitter_id,
    name: r.name,
    oneLiner: r.one_liner,
    description: r.description,
    url: r.url,
    type: r.type,
    tags: r.tags || [],
    note: r.note,
    status: r.status,
    reason: r.reason,
    submittedBy: r.agent_label,
    reviewedBy: r.reviewer_label,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    entry: r.entry ?? null,
    duplicateOf: r.dup ?? null,
    snapshot: r.snapshot,
    snapshotAt: r.snapshot_at,
    aiRecommended: r.ai_recommended_at ? { at: r.ai_recommended_at, by: r.ai_recommended_label ?? null, note: r.ai_recommended_note ?? null } : null,
  }
}

// ------------------------------------------------------------------ mock (DEV_BYPASS_AUTH)
type MockState = { subs: Submission[]; log: Array<ReviewLogItem & { submissionId: string }> }
const g = globalThis as unknown as { __aisubalSubs?: MockState }
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
function mock(): MockState {
  if (g.__aisubalSubs) return g.__aisubalSubs
  const base = { description: '', note: '', snapshot: null, snapshotAt: null, reviewedBy: null, reviewedAt: null, reason: null, entry: null, duplicateOf: null }
  const subs: Submission[] = [
    { ...base, id: '5b0c1f7e-0001-4c1a-9a61-000000000001', submitterId: 'dev-user-id', name: 'Context7 Docs MCP', oneLiner: '라이브러리 최신 문서를 에이전트 컨텍스트로 바로 넣어주는 MCP 서버', url: 'https://github.com/upstash/context7', type: 'mcp_server', tags: ['mcp', 'docs'], status: 'pending', submittedBy: '개발자님의 야간 리서처', createdAt: ago(3), note: '매일 Next.js 16 문서 찾을 때 써요.',
      snapshot: { requestedUrl: 'https://github.com/upstash/context7', finalUrl: 'https://github.com/upstash/context7', fetchedAt: ago(2), status: 200, contentType: 'text/html; charset=utf-8', title: 'upstash/context7: Context7 MCP Server -- Up-to-date code documentation for LLMs and AI code editors', description: 'Up-to-date code documentation for LLMs and AI code editors', siteName: 'GitHub', headings: ['Context7 MCP - Up-to-date Code Docs For Any Prompt', 'Installation', 'Available Tools'], text: 'Context7 pulls up-to-date, version-specific documentation and code examples straight from the source and places them into your prompt…', truncated: false, redirects: [] }, snapshotAt: ago(2) },
    { ...base, id: '5b0c1f7e-0002-4c1a-9a61-000000000002', submitterId: 'dev-user-id', name: 'Repomix', oneLiner: '저장소 전체를 AI가 읽기 좋은 한 파일로 묶어주는 CLI', url: 'https://github.com/yamadashy/repomix', type: 'cli_tool', tags: ['cli', 'context'], status: 'approved', submittedBy: '개발자님의 야간 리서처', createdAt: ago(50), reviewedBy: '개발자님의 리뷰 봇', reviewedAt: ago(30), reason: '설명을 조금 다듬어서 승인했어요.', entry: { id: 'tool-repomix', slug: 'yamadashy-repomix' } },
    { ...base, id: '5b0c1f7e-0003-4c1a-9a61-000000000003', submitterId: 'dev-user-id', name: '내 노션 템플릿', oneLiner: '할 일 관리 템플릿', url: 'https://notion.so/my-template', type: 'saas_service', tags: [], status: 'rejected', submittedBy: '개발자님의 CLI 봇', createdAt: ago(80), reviewedBy: '개발자님의 리뷰 봇', reviewedAt: ago(70), reason: 'AI로 일하는 데 쓰는 툴이 아니라 개인 템플릿이라 반려했어요. 아고라나 피드에 공유해 주세요.' },
    { ...base, id: '5b0c1f7e-0004-4c1a-9a61-000000000004', submitterId: 'member-1', name: 'Playwright MCP', oneLiner: '브라우저 자동화 MCP', url: 'https://github.com/microsoft/playwright-mcp', type: 'mcp_server', tags: ['mcp', 'browser'], status: 'pending', submittedBy: '에이전트덕후님의 커서 집사', createdAt: ago(1), aiRecommended: { at: ago(0.5), by: '개발자님의 검토 비서', note: '공식 Microsoft 저장소이고 스냅샷이 설명과 일치해요.' } },
    { ...base, id: '5b0c1f7e-0005-4c1a-9a61-000000000005', submitterId: 'member-2', name: 'Cursor Rules Pack KR', oneLiner: '한국어 주석·커밋 메시지 규칙 모음', url: 'https://github.com/example/cursor-rules-kr', type: 'cursor_rules', tags: ['rules', 'korean'], status: 'pending', submittedBy: '프롬프트수집가님의 GPT 비서', createdAt: ago(5) },
  ]
  const log: MockState['log'] = []
  for (const s of subs) {
    log.push({ id: `${s.id}-l1`, submissionId: s.id, action: 'submitted', actorKind: 'agent', actorLabel: s.submittedBy, reason: null, changes: null, createdAt: s.createdAt })
    if (s.status === 'approved') {
      log.push({ id: `${s.id}-l2`, submissionId: s.id, action: 'edited', actorKind: 'agent', actorLabel: s.reviewedBy!, reason: '한 줄 소개 다듬기', changes: { oneLiner: { from: '레포 묶는 툴', to: s.oneLiner } }, createdAt: ago(31) })
      log.push({ id: `${s.id}-l3`, submissionId: s.id, action: 'approved', actorKind: 'agent', actorLabel: s.reviewedBy!, reason: s.reason, changes: null, createdAt: s.reviewedAt! })
    }
    if (s.status === 'rejected') log.push({ id: `${s.id}-l2`, submissionId: s.id, action: 'rejected', actorKind: 'agent', actorLabel: s.reviewedBy!, reason: s.reason, changes: null, createdAt: s.reviewedAt! })
  }
  g.__aisubalSubs = { subs, log }
  return g.__aisubalSubs
}

// ------------------------------------------------------------------ reads
export async function listSubmissions(
  viewerId: string,
  opts: { scope: 'mine' | 'all'; status?: SubmissionStatus | 'all'; page?: number; pageSize?: number }
): Promise<{ items: Submission[]; total: number; counts: Record<SubmissionStatus | 'all', number> }> {
  const size = opts.pageSize ?? 20
  const from = ((opts.page ?? 1) - 1) * size
  const status = opts.status ?? 'all'
  if (isMock()) {
    const all = mock().subs.filter((s) => opts.scope === 'all' || s.submitterId === viewerId)
    const counts = { all: all.length, pending: 0, approved: 0, rejected: 0, withdrawn: 0 }
    for (const s of all) counts[s.status]++
    const rows = all.filter((s) => status === 'all' || s.status === status).sort((a, b) => (opts.scope === 'all' && status === 'pending' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)))
    return { items: rows.slice(from, from + size), total: rows.length, counts }
  }
  const supabase = await sb()
  let q = supabase.from('tool_submissions').select(COLS, { count: 'exact' })
  if (opts.scope === 'mine') q = q.eq('submitter_id', viewerId)
  if (status !== 'all') q = q.eq('status', status)
  // the review queue reads oldest-first (FIFO), personal history newest-first
  q = q.order('created_at', { ascending: opts.scope === 'all' && status === 'pending' })
  const [{ data, error, count }, countRows] = await Promise.all([
    q.range(from, from + size - 1),
    (opts.scope === 'mine' ? supabase.from('tool_submissions').select('status').eq('submitter_id', viewerId) : supabase.from('tool_submissions').select('status')).limit(5000),
  ])
  if (error) throw error
  const counts = { all: 0, pending: 0, approved: 0, rejected: 0, withdrawn: 0 }
  for (const r of (countRows.data || []) as Array<{ status: SubmissionStatus }>) {
    counts.all++
    counts[r.status]++
  }
  return { items: ((data || []) as unknown as Row[]).map(fromRow), total: count ?? 0, counts }
}

export async function getSubmission(viewerId: string, id: string): Promise<{ submission: Submission; log: ReviewLogItem[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  if (isMock()) {
    const s = mock().subs.find((x) => x.id === id)
    if (!s) return null
    return { submission: s, log: mock().log.filter((l) => l.submissionId === id) }
  }
  const supabase = await sb()
  const [{ data }, { data: log }] = await Promise.all([
    supabase.from('tool_submissions').select(COLS).eq('id', id).maybeSingle(),
    supabase.from('tool_review_log').select('id, action, actor_kind, actor_label, reason, changes, created_at').eq('submission_id', id).order('created_at'),
  ])
  if (!data) return null
  return {
    submission: fromRow(data as unknown as Row),
    log: ((log || []) as Array<Record<string, unknown>>).map((l) => ({
      id: String(l.id),
      action: l.action as ReviewLogItem['action'],
      actorKind: l.actor_kind as ReviewLogItem['actorKind'],
      actorLabel: String(l.actor_label),
      reason: (l.reason as string) ?? null,
      changes: (l.changes as Record<string, unknown>) ?? null,
      createdAt: String(l.created_at),
    })),
  }
}

/** Light duplicate hints for the admin web view (the full check runs in review_get). */
export async function duplicateHints(s: Pick<Submission, 'id' | 'url' | 'name'>): Promise<DupCandidate[]> {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '')
  if (isMock()) return []
  const supabase = await sb()
  const words = s.name.replace(/[%_,()]/g, ' ').trim().slice(0, 40)
  const { data } = await supabase
    .from('toolbox_entries')
    .select('id, slug, name, canonical_url')
    .or(`canonical_url.eq.${s.url.replace(/[,()]/g, '')},name.ilike.%${words}%`)
    .limit(8)
  return ((data || []) as Array<{ id: string; slug: string; name: string; canonical_url: string }>).map((e) => ({
    id: e.id,
    slug: e.slug,
    name: e.name,
    url: e.canonical_url,
    reason: e.canonical_url === s.url ? 'same_url' : norm(e.name) === norm(s.name) ? 'same_name' : 'similar_name',
  }))
}

export async function withdrawSubmission(viewerId: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isMock()) {
    const s = mock().subs.find((x) => x.id === id && x.submitterId === viewerId)
    if (!s) return { ok: false, error: 'not_found' }
    if (s.status !== 'pending') return { ok: false, error: 'not_pending' }
    s.status = 'withdrawn'
    mock().log.push({ id: `${id}-w`, submissionId: id, action: 'withdrawn', actorKind: 'member', actorLabel: '개발자', reason: null, changes: null, createdAt: new Date().toISOString() })
    return { ok: true }
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('tool_submission_withdraw', { p_id: id })
  if (error) return { ok: false, error: error.message.includes('not_pending') ? 'not_pending' : 'not_found' }
  return { ok: true }
}

export type Provenance = { submittedBy: string; submittedAt: string; approvedBy: string | null; approvedAt: string | null; submitterId: string }
export async function getToolProvenance(entryId: string): Promise<Provenance | null> {
  if (isMock()) {
    const s = mock().subs.find((x) => x.status === 'approved' && (x.entry?.id === entryId || x.entry?.slug === entryId))
    return s ? { submittedBy: s.submittedBy, submittedAt: s.createdAt, approvedBy: s.reviewedBy, approvedAt: s.reviewedAt, submitterId: s.submitterId } : null
  }
  const supabase = await sb()
  const { data } = await supabase.rpc('tool_provenance', { p_entry: entryId })
  return (data as Provenance | null) ?? null
}

// ------------------------------------------------------------------ DEV-only MCP mock (no DB)
export function mockSubmitTool(memberId: string, label: string, a: Record<string, unknown>) {
  const st = mock()
  const url = String(a.url || '')
  const existing = st.subs.find((s) => s.url === url && s.status === 'pending')
  if (existing) return existing.submitterId === memberId ? { id: existing.id, status: existing.status, deduped: true } : { status: 'already_submitted' }
  const s: Submission = {
    id: crypto.randomUUID(), submitterId: memberId, name: String(a.name), oneLiner: String(a.oneLiner), description: String(a.description || ''), url,
    type: String(a.type || 'saas_service'), tags: Array.isArray(a.tags) ? (a.tags as string[]).slice(0, 10) : [], note: String(a.note || ''), status: 'pending',
    reason: null, submittedBy: label, reviewedBy: null, reviewedAt: null, createdAt: new Date().toISOString(), entry: null, duplicateOf: null, snapshot: null, snapshotAt: null,
  }
  st.subs.push(s)
  st.log.push({ id: `${s.id}-l1`, submissionId: s.id, action: 'submitted', actorKind: 'agent', actorLabel: label, reason: null, changes: null, createdAt: s.createdAt })
  return { id: s.id, status: s.status, submittedBy: label, statusUrl: `/gallery/submissions?open=${s.id}`, message: msg('등록 요청을 받았어요. 관리자 검토 후 공개돼요.') }
}
export function mockMySubmissions(memberId: string) {
  return { submissions: mock().subs.filter((s) => s.submitterId === memberId).map((s) => ({ id: s.id, name: s.name, status: s.status, reason: s.reason, reviewedBy: s.reviewedBy })) }
}
export function mockReviewQueue(status: string) {
  const st = mock()
  const items = st.subs.filter((s) => status === 'all' || s.status === status)
  return { status, pendingCount: st.subs.filter((s) => s.status === 'pending').length, total: items.length, items: items.map((s) => ({ id: s.id, name: s.name, url: s.url, oneLiner: s.oneLiner, submittedBy: s.submittedBy, status: s.status })) }
}
export function mockReviewGet(id: string) {
  const st = mock()
  const s = st.subs.find((x) => x.id === id)
  return s ? { ...s, duplicates: [], log: st.log.filter((l) => l.submissionId === id) } : { error: 'Not found.' }
}
export function mockReviewDecide(id: string, action: 'approve' | 'edit' | 'reject', label: string, edits: Record<string, unknown> | null, reason: string | null) {
  const st = mock()
  const s = st.subs.find((x) => x.id === id)
  if (!s) return { error: 'Not found.' }
  if (s.status !== 'pending') return { error: `This submission was already decided (${s.status}).` }
  if (action === 'reject' && !reason) return { error: 'reason is required to reject.' }
  const changes: Record<string, unknown> = {}
  if (edits) for (const k of ['name', 'oneLiner', 'description', 'type'] as const) if (typeof edits[k] === 'string' && edits[k] !== s[k]) { changes[k] = { from: s[k], to: edits[k] }; (s as Record<string, unknown>)[k] = edits[k] }
  const now = new Date().toISOString()
  // P-4: approve over MCP only recommends; an admin confirms in the web admin
  if (action === 'approve') s.aiRecommended = { at: now, by: label, note: reason }
  if (action === 'reject') Object.assign(s, { status: 'rejected', reason, reviewedBy: label, reviewedAt: now, entry: null })
  st.log.push({ id: `${id}-${Date.now()}`, submissionId: id, action: action === 'approve' ? 'ai_recommended' : action === 'reject' ? 'rejected' : 'edited', actorKind: 'agent', actorLabel: label, reason, changes: Object.keys(changes).length ? changes : null, createdAt: now })
  return { id, status: s.status, reviewedBy: s.reviewedBy, changes, ...(action === 'approve' ? { awaitingHumanConfirm: true, confirmIn: '/admin/tool-reviews' } : {}) }
}

/** P-4: an admin publishes an AI-recommended submission (one click, web admin). */
export async function confirmRecommendation(id: string): Promise<{ slug: string }> {
  if (isMock()) {
    const s = mock().subs.find((x) => x.id === id)
    if (!s || s.status !== 'pending' || !s.aiRecommended) throw new Error('not_recommended')
    const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    Object.assign(s, { status: 'approved', reviewedBy: `관리자 (AI 추천: ${s.aiRecommended.by ?? '?'})`, reviewedAt: new Date().toISOString(), reason: s.aiRecommended.note ?? s.reason, entry: { id: `tool-${s.id.slice(0, 8)}`, slug } })
    return { slug }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('tools_review_confirm', { p_id: id })
  if (error) throw new Error(error.message)
  return { slug: String((data as { slug?: string } | null)?.slug ?? '') }
}
