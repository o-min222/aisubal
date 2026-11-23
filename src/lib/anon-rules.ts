import { msg as M } from '@/i18n/translate'
import type { TimelinePost } from '@/components/timeline/types'

/** 익명 board rules shared by API routes, the mock store and tests. */
/** Sanity cap only (DB anon_posts_body_len / anon_create); no counter in the UI. */
export const ANON_MAX_CHARS = 20000

export const ANON_CATEGORIES = [
  { id: 'chat', label: M('잡담') },
  { id: 'work', label: M('회사생활') },
  { id: 'career', label: M('커리어') },
  { id: 'ai', label: M('AI토로') },
  { id: 'worry', label: M('고민') },
] as const

export type AnonCategory = (typeof ANON_CATEGORIES)[number]['id']
export type AnonSort = 'latest' | 'popular'

export const ANON_REPORT_REASONS = ['욕설·비하', '개인정보 노출', '스팸·홍보', '허위사실', '기타'] as const

/** Shown wherever people write: anonymous to members, traceable by admins for abuse. */
export const ANON_NOTICE = M(
  '회원에게는 익명으로 보여요. 단, 신고된 악용은 운영자가 작성자를 확인하고 조치할 수 있어요.',
)


export function isAnonCategory(v: unknown): v is AnonCategory {
  return typeof v === 'string' && ANON_CATEGORIES.some((c) => c.id === v)
}

export function categoryLabel(id: string | null | undefined): string | null {
  return ANON_CATEGORIES.find((c) => c.id === id)?.label ?? null
}

export function parseSort(v: string | null | undefined): AnonSort {
  return v === 'popular' ? 'popular' : 'latest'
}

/** The thread author's alias; their replies also carry the 글쓴이 chip (isOp). */
export const ANON_OP_ALIAS = '익명'

/**
 * A42: per-thread aliases (mirrors anon_private.alias_for, 0097). The OP is "익명" and everyone else
 * gets the next number in order of first reply: 익명1, 익명2, …
 */
export function pickAlias(used: Iterable<string>, isOp = false): string {
  if (isOp) return ANON_OP_ALIAS
  let n = 0
  for (const a of used) if (/^익명\d+$/.test(a)) n++
  return `익명${n + 1}`
}

export type AnonInput = { body: string; category: AnonCategory | null; parentId: string | null }

export function validateAnonInput(raw: {
  body?: unknown
  category?: unknown
  parentId?: unknown
}): { ok: true; value: AnonInput } | { ok: false; error: string } {
  const body = typeof raw.body === 'string' ? raw.body.trim() : ''
  if (!body) return { ok: false, error: M('내용을 입력해주세요.') }
  if ([...body].length > ANON_MAX_CHARS) return { ok: false, error: M('글이 너무 길어요. 나눠서 올려 주세요.') }
  const parentId = typeof raw.parentId === 'string' && raw.parentId ? raw.parentId : null
  if (!parentId && !isAnonCategory(raw.category)) return { ok: false, error: M('카테고리를 골라주세요.') }
  return { ok: true, value: { body, category: parentId ? null : (raw.category as AnonCategory), parentId } }
}

/** Shape returned by the anon_* RPCs. Deliberately has no member/author id. */
export type AnonRow = {
  id: string
  parentId: string | null
  rootId: string | null
  replyToId?: string | null
  category: string
  body: string
  alias: string
  isOp: boolean
  likeCount: number
  replyCount: number
  likedByMe: boolean
  isMine: boolean
  reportedByMe: boolean
  isHidden: boolean
  isDeleted: boolean
  /** 0064: author edited the body (no timestamp, on purpose) */
  isEdited?: boolean
  createdAt: string
  // admin only
  reportCount?: number
  hiddenReason?: string | null
  adminCleared?: boolean
  reportReasons?: string[]
}

export function anonRowToTimeline(r: AnonRow): TimelinePost {
  return {
    id: r.id,
    parentId: r.parentId,
    rootId: r.rootId,
    replyToId: r.replyToId ?? null,
    // author.id is the alias scoped to this thread — never a member id
    author: { kind: 'anon', id: `${r.rootId ?? r.id}:${r.alias}`, name: r.alias },
    body: r.isDeleted ? '' : r.body,
    linkUrl: null,
    imageUrl: null,
    tool: null,
    rating: null,
    likeCount: r.likeCount,
    likedByMe: r.likedByMe,
    replyCount: r.replyCount,
    createdAt: r.createdAt,
    isHidden: r.isHidden,
    isOp: r.isOp,
    isDeleted: r.isDeleted,
    isEdited: Boolean(r.isEdited && !r.isDeleted),
    isMine: r.isMine,
    reportedByMe: r.reportedByMe,
    category: r.category,
  }
}

const ERRORS: Record<string, [number, string]> = {
  anon_unauthorized: [401, '로그인이 필요해요.'],
  anon_forbidden: [403, '가입을 마친 회원만 이용할 수 있어요.'],
  anon_admin_only: [403, '운영자만 할 수 있어요.'],
  anon_not_found: [404, '글을 찾을 수 없어요. 삭제되었거나 숨겨졌을 수 있어요.'],
  anon_empty: [400, '내용을 입력해주세요.'],
  anon_too_long: [400, M('글이 너무 길어요. 나눠서 올려 주세요.')],
  anon_bad_category: [400, '카테고리를 골라주세요.'],
  anon_daily_limit: [429, '오늘 쓸 수 있는 한도를 다 썼어요. 내일 다시 시도해주세요.'],
  anon_report_reason: [400, '신고 사유를 골라주세요.'],
  anon_report_own: [400, '내 글은 신고할 수 없어요.'],
  anon_trace_reason: [400, '조회 사유를 입력해주세요.'],
  anon_locked: [403, M('익명 라운지는 아직 열리지 않았어요.')],
}

/** Maps RPC exception codes to HTTP status + Korean copy. Unknown → 500. */
export function anonError(e: unknown): { status: number; error: string } {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  const code = Object.keys(ERRORS).find((k) => msg.includes(k))
  if (code) return { status: ERRORS[code][0], error: ERRORS[code][1] }
  return { status: 500, error: M('처리하지 못했어요. 잠시 후 다시 시도해주세요.') }
}
