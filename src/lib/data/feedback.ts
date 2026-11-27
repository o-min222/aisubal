import sharp from 'sharp'
import { isMock, sb } from './client'
import { createAnonClient } from '@/lib/supabase/anon'
import { FEEDBACK_SHOT_TYPES, FEEDBACK_SHOT_MAX_BYTES, feedbackShotPath, myFeedbackPath, type FeedbackItem, type FeedbackMeta, type FeedbackStatus } from '@/lib/feedback'
import { mockAppendNotification } from './notifications'

/** A105 화면 피드백: everything goes through the 0133 RPCs; screenshots sit in the private feedback-shots bucket. */
const BUCKET = 'feedback-shots'
export const FEEDBACK_SHOT_FINAL_MAX = 1_500_000

export class FeedbackError extends Error {}

type MockStore = { items: Map<string, FeedbackItem & { shot?: Buffer }>; enabled: Set<string> }
const g = globalThis as unknown as { __aisubalFeedback?: MockStore }
function mock(): MockStore {
  if (g.__aisubalFeedback) return g.__aisubalFeedback
  const now = Date.now()
  const iso = (m: number) => new Date(now - m * 60_000).toISOString()
  const base = { theme: 'light' as const, locale: 'ko' as const, component: null, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', adminNote: null, reviewedAt: null, webhookStatus: null, webhookNote: null, webhookAt: null, progressNote: null, progressAt: null, hasShot: false }
  const items: FeedbackItem[] = [
    { ...base, id: '00000000-0000-4000-8000-000000000105', status: 'pending', body: '이 버튼 글자가 다크 모드에서 거의 안 보여요. 대비를 올려 주세요.', route: '/feed', viewport: { width: 390, height: 844, dpr: 3 }, theme: 'dark', selector: 'main#main > div.feed-tabs > button:nth-of-type(2)', elementText: '팔로잉', bbox: { x: 140, y: 112, width: 92, height: 36, pageX: 140, pageY: 112 }, createdAt: iso(4), updatedAt: iso(4), author: { id: 'member-2', name: '프롬프트수집가', handle: 'prompt', avatarUrl: null } },
    { ...base, id: '00000000-0000-4000-8000-000000000106', status: 'approved', body: 'Profile card overlaps the rail at 1280px.', route: '/members/me', viewport: { width: 1280, height: 800, dpr: 2 }, locale: 'en', selector: 'aside.app-left > div.app-sticky', elementText: null, bbox: { x: 24, y: 80, width: 260, height: 320, pageX: 24, pageY: 80 }, reviewedAt: iso(30), webhookStatus: 'skipped', webhookNote: 'FEEDBACK_WEBHOOK_URL / FEEDBACK_WEBHOOK_KEY not set', webhookAt: iso(30), createdAt: iso(60), updatedAt: iso(30), author: { id: 'dev-user-id', name: '개발자', handle: 'dev', avatarUrl: null } },
    { ...base, id: '00000000-0000-4000-8000-000000000107', status: 'deployed', body: '모임 카드 날짜가 두 줄로 깨져요', route: '/moim', viewport: { width: 412, height: 915, dpr: 2.6 }, selector: 'li.moim-card:nth-of-type(1) > time', elementText: '11월 28일 (금) 오후 7:30', bbox: { x: 16, y: 240, width: 180, height: 40, pageX: 16, pageY: 240 }, reviewedAt: iso(600), webhookStatus: 'sent', webhookNote: 'HTTP 200', webhookAt: iso(600), progressNote: 'A106 · 3f2c1ab', progressAt: iso(300), createdAt: iso(700), updatedAt: iso(300), author: { id: 'member-3', name: 'MCP장인', handle: 'mcp', avatarUrl: null } },
    { ...base, id: '00000000-0000-4000-8000-000000000108', status: 'rejected', body: '검색 결과가 비어 있을 때 안내 문장이 너무 작아요.', route: '/feed', viewport: { width: 390, height: 844, dpr: 3 }, theme: 'dark', selector: 'main#main p.empty', elementText: '아직 글이 없어요', bbox: { x: 24, y: 320, width: 340, height: 48, pageX: 24, pageY: 320 }, reviewedAt: iso(20), adminNote: '이미 같은 내용이 반영되어 있어요.', createdAt: iso(80), updatedAt: iso(20), author: { id: 'dev-user-id', name: '개발자', handle: 'dev', avatarUrl: null } },
  ]
  g.__aisubalFeedback = { items: new Map(items.map((i) => [i.id, i])), enabled: new Set() }
  return g.__aisubalFeedback
}
export function mockFeedbackShot(id: string): Buffer | null {
  return isMock() ? (mock().items.get(id)?.shot ?? null) : null
}
export function mockSeedFeedbackShot(id: string, shot: Buffer) {
  const it = mock().items.get(id)
  if (it) it.shot = shot
  if (it) it.hasShot = true
}

/** Any browser image → WebP, ≤ 1600 px wide, ≤ 1.5 MB (quality steps down if needed). */
export async function toShotWebp(file: File): Promise<Buffer> {
  if (!FEEDBACK_SHOT_TYPES.includes(file.type)) throw new FeedbackError('shot_type')
  if (file.size > FEEDBACK_SHOT_MAX_BYTES) throw new FeedbackError('shot_size')
  const input = Buffer.from(await file.arrayBuffer())
  for (const quality of [80, 65, 50]) {
    const out = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality }).toBuffer()
    if (out.length <= FEEDBACK_SHOT_FINAL_MAX) return out
  }
  throw new FeedbackError('shot_size')
}

const RPC_ERRORS = ['feedback_not_allowed', 'feedback_empty', 'feedback_rate_limited', 'feedback_bad_shot', 'feedback_bad_transition', 'feedback_not_found', 'feedback_forbidden']
function rpcError(e: { message?: string } | null): never {
  const code = RPC_ERRORS.find((c) => e?.message?.includes(c))
  throw new FeedbackError(code ?? 'feedback_failed')
}

export async function submitFeedback(authId: string, member: { id: string; display_name: string; handle?: string | null }, meta: FeedbackMeta, shot: Buffer | null, userAgent: string | null): Promise<string> {
  const id = crypto.randomUUID()
  if (isMock()) {
    const now = new Date().toISOString()
    mock().items.set(id, {
      id, status: 'pending', body: meta.body, route: meta.route, viewport: meta.viewport, theme: meta.theme, locale: meta.locale, selector: meta.selector, component: meta.component,
      elementText: meta.elementText, bbox: meta.bbox, userAgent, hasShot: Boolean(shot), shot: shot ?? undefined, adminNote: null, reviewedAt: null, webhookStatus: null, webhookNote: null,
      webhookAt: null, progressNote: null, progressAt: null, createdAt: now, updatedAt: now, author: { id: member.id, name: member.display_name, handle: member.handle ?? null, avatarUrl: null },
    })
    return id
  }
  const supabase = await sb()
  let path: string | null = null
  if (shot) {
    path = feedbackShotPath(authId, id)
    const { error } = await supabase.storage.from(BUCKET).upload(path, shot, { contentType: 'image/webp', upsert: false, cacheControl: '3600' })
    // a failed shot never blocks the report itself
    if (error) {
      console.error('[feedback] shot upload failed', error.message)
      path = null
    }
  }
  const { error } = await supabase.rpc('feedback_item_submit', {
    p_id: id, p_body: meta.body, p_route: meta.route, p_viewport: meta.viewport, p_theme: meta.theme, p_locale: meta.locale,
    p_selector: meta.selector, p_component: meta.component, p_element_text: meta.elementText, p_bbox: meta.bbox, p_user_agent: userAgent, p_shot_path: path,
  })
  if (error) rpcError(error)
  return id
}

export async function adminListFeedback(status: FeedbackStatus | null): Promise<FeedbackItem[]> {
  if (isMock()) {
    const all = [...mock().items.values()].map(({ shot: _s, ...i }) => i)
    return all.filter((i) => !status || i.status === status).sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.createdAt.localeCompare(a.createdAt))
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('admin_feedback_list', { p_status: status, p_limit: 100 })
  if (error) throw error
  return (data ?? []) as FeedbackItem[]
}

export type FeedbackDetail = FeedbackItem & { screenshotPath: string | null }

export async function adminGetFeedback(id: string): Promise<FeedbackDetail | null> {
  if (isMock()) {
    const it = mock().items.get(id)
    if (!it) return null
    const { shot, ...rest } = it
    return { ...rest, screenshotPath: shot ? `mock/${id}.webp` : null }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('admin_feedback_get', { p_id: id })
  if (error) throw error
  return (data as FeedbackDetail | null) ?? null
}

/** A signed URL for an admin (the bucket's select policy is admin-or-owner). */
export async function signedFeedbackShot(path: string, ttlSeconds: number): Promise<string | null> {
  if (isMock()) return null
  const supabase = await sb()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttlSeconds)
  return error || !data?.signedUrl ? null : data.signedUrl
}


function mockNotifyAuthor(item: FeedbackItem, prevStatus: FeedbackStatus) {
  if (item.status === prevStatus || !item.author?.id) return
  if (item.status !== 'rejected' && item.status !== 'approved' && item.status !== 'deployed') return
  const kind = item.status === 'rejected' ? 'feedback_reply' : item.status === 'approved' ? 'feedback_approved' : 'feedback_deployed'
  const excerpt = item.status === 'rejected' ? item.adminNote : item.status === 'deployed' ? item.progressNote : null
  mockAppendNotification({
    id: `fb-${item.id}-${item.status}`,
    kind,
    category: 'admin',
    link: myFeedbackPath(item.id),
    excerpt,
    targetKind: 'feedback',
    count: 1,
    createdAt: new Date().toISOString(),
    unread: true,
    actor: { kind: 'someone', id: null, name: null, avatarUrl: null },
  })
}
function mockUpdate(id: string, patch: Partial<FeedbackItem>): FeedbackItem {
  const it = mock().items.get(id)
  if (!it) throw new FeedbackError('feedback_not_found')
  Object.assign(it, patch, { updatedAt: new Date().toISOString() })
  const { shot: _s, ...rest } = it
  return rest
}

export async function adminReviewFeedback(id: string, action: 'approve' | 'reject', note: string | null): Promise<FeedbackDetail> {
  if (isMock()) {
    const cur = mock().items.get(id)
    const okFrom = action === 'approve' ? ['pending', 'rejected'] : ['pending', 'approved']
    if (!cur || !okFrom.includes(cur.status)) throw new FeedbackError('feedback_bad_transition')
    const r = mockUpdate(id, { status: action === 'approve' ? 'approved' : 'rejected', reviewedAt: new Date().toISOString(), adminNote: note || cur.adminNote })
    mockNotifyAuthor(r, cur.status)
    return { ...r, screenshotPath: cur.shot ? `mock/${id}.webp` : null }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('admin_feedback_review', { p_id: id, p_action: action, p_note: note })
  if (error) rpcError(error)
  return data as FeedbackDetail
}

export async function adminSetFeedbackStatus(id: string, status: 'in_progress' | 'deployed', note: string | null): Promise<FeedbackItem> {
  if (isMock()) {
    const cur = mock().items.get(id)
    const ok = status === 'in_progress' ? ['approved', 'in_progress'] : ['approved', 'in_progress', 'deployed']
    if (!cur || !ok.includes(cur.status)) throw new FeedbackError('feedback_bad_transition')
    const r = mockUpdate(id, { status, progressAt: new Date().toISOString(), progressNote: note || cur.progressNote })
    mockNotifyAuthor(r, cur.status)
    return r
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('admin_feedback_set_status', { p_id: id, p_status: status, p_note: note })
  if (error) rpcError(error)
  return data as FeedbackItem
}

export async function adminRecordWebhook(id: string, status: 'sent' | 'skipped' | 'failed', note: string): Promise<FeedbackItem> {
  if (isMock()) return mockUpdate(id, { webhookStatus: status, webhookNote: note, webhookAt: new Date().toISOString() })
  const supabase = await sb()
  const { data, error } = await supabase.rpc('admin_feedback_webhook_result', { p_id: id, p_status: status, p_note: note })
  if (error) rpcError(error)
  return data as FeedbackItem
}

/** Bot callback: the DB checks the secret's sha256 (no service role). */
export async function feedbackProgress(secret: string, id: string, status: 'in_progress' | 'deployed', note: string | null): Promise<FeedbackItem> {
  if (isMock()) return adminSetFeedbackStatus(id, status, note)
  const { data, error } = await createAnonClient().rpc('feedback_progress', { p_secret: secret, p_id: id, p_status: status, p_note: note })
  if (error) rpcError(error)
  return data as FeedbackItem
}

export async function adminSetFeedbackEnabled(memberId: string, on: boolean): Promise<boolean> {
  if (isMock()) {
    if (on) mock().enabled.add(memberId)
    else mock().enabled.delete(memberId)
    return on
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('admin_set_feedback_enabled', { p_member: memberId, p_on: on })
  if (error) throw error
  return Boolean((data as { feedbackEnabled?: boolean } | null)?.feedbackEnabled)
}
export function mockFeedbackEnabled(memberId: string): boolean {
  return mock().enabled.has(memberId)
}

export type MyFeedback = {
  id: string
  status: FeedbackStatus
  body: string
  route: string
  hasShot: boolean
  adminNote: string | null
  reviewedAt: string | null
  progressNote: string | null
  progressAt: string | null
  createdAt: string
  updatedAt: string
  screenshotPath?: string | null
}

function toMine(i: FeedbackItem & { screenshotPath?: string | null }): MyFeedback {
  return {
    id: i.id, status: i.status, body: i.body, route: i.route, hasShot: i.hasShot,
    adminNote: i.adminNote, reviewedAt: i.reviewedAt, progressNote: i.progressNote, progressAt: i.progressAt,
    createdAt: i.createdAt, updatedAt: i.updatedAt, screenshotPath: i.screenshotPath ?? null,
  }
}

export async function listMyFeedback(memberId: string): Promise<MyFeedback[]> {
  if (isMock()) {
    return [...mock().items.values()]
      .filter((i) => i.author?.id === memberId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((i) => toMine(i))
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('feedback_mine_list', { p_limit: 50 })
  if (error) throw error
  return (data ?? []) as MyFeedback[]
}

export async function getMyFeedback(memberId: string, id: string): Promise<MyFeedback | null> {
  if (isMock()) {
    const it = mock().items.get(id)
    if (!it || it.author?.id !== memberId) return null
    return toMine({ ...it, screenshotPath: it.shot ? `mock/${id}.webp` : null })
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('feedback_mine_get', { p_id: id })
  if (error) throw error
  return (data as MyFeedback | null) ?? null
}
