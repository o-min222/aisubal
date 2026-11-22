import { msg as M } from '@/i18n/translate'
import { AUTHORSHIPS, parseAuthorship, type Authorship } from '@/lib/authorship'
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

export const ANON_ANIMALS = [
  '고양이', '강아지', '수달', '너구리', '펭귄', '판다', '여우', '토끼', '다람쥐', '고래',
  '돌고래', '코알라', '햄스터', '부엉이', '올빼미', '사슴', '라쿤', '알파카', '기린', '코끼리', '하마', '거북이',
  '해달', '물개', '미어캣', '카피바라', '두더지', '고슴도치', '오리', '참새', '까치', '독수리', '앵무새', '문어',
  '해파리', '치타', '호랑이', '사자', '곰', '늑대', '고라니', '청설모', '오소리', '두루미', '백조', '홍학', '라마', '바다표범',
]

export function isAnonCategory(v: unknown): v is AnonCategory {
  return typeof v === 'string' && ANON_CATEGORIES.some((c) => c.id === v)
}

export function categoryLabel(id: string | null | undefined): string | null {
  return ANON_CATEGORIES.find((c) => c.id === id)?.label ?? null
}

export function parseSort(v: string | null | undefined): AnonSort {
  return v === 'popular' ? 'popular' : 'latest'
}

/** Picks an unused "익명의 {동물}" for a thread (mirrors anon_private.alias_for). */
export function pickAlias(used: Iterable<string>, rand: () => number = Math.random): string {
  const taken = new Set(used)
  const free = ANON_ANIMALS.map((a) => `익명의 ${a}`).filter((a) => !taken.has(a))
  if (free.length) return free[Math.floor(rand() * free.length)]
  return `익명의 ${ANON_ANIMALS[Math.floor(rand() * ANON_ANIMALS.length)]} ${taken.size + 1}`
}

export type AnonInput = { body: string; category: AnonCategory | null; parentId: string | null; authorship: Authorship }

export function validateAnonInput(raw: {
  body?: unknown
  category?: unknown
  parentId?: unknown
  authorship?: unknown
}): { ok: true; value: AnonInput } | { ok: false; error: string } {
  const body = typeof raw.body === 'string' ? raw.body.trim() : ''
  if (!body) return { ok: false, error: M('내용을 입력해주세요.') }
  if ([...body].length > ANON_MAX_CHARS) return { ok: false, error: M('글이 너무 길어요. 나눠서 올려 주세요.') }
  const parentId = typeof raw.parentId === 'string' && raw.parentId ? raw.parentId : null
  if (!parentId && !isAnonCategory(raw.category)) return { ok: false, error: M('카테고리를 골라주세요.') }
  if (raw.authorship != null && !AUTHORSHIPS.includes(raw.authorship as Authorship)) return { ok: false, error: M('잘못된 설정값입니다.') }
  return { ok: true, value: { body, category: parentId ? null : (raw.category as AnonCategory), parentId, authorship: parseAuthorship(raw.authorship) } }
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
  /** 0047: author-declared */
  authorship?: string | null
  likeCount: number
  replyCount: number
  likedByMe: boolean
  isMine: boolean
  reportedByMe: boolean
  isHidden: boolean
  isDeleted: boolean
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
    isMine: r.isMine,
    reportedByMe: r.reportedByMe,
    category: r.category,
    authorship: parseAuthorship(r.authorship),
  }
}

const ERRORS: Record<string, [number, string]> = {
  anon_unauthorized: [401, '로그인이 필요해요.'],
  self_like: [400, '내 글에는 좋아요를 누를 수 없어요.'],
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
  anon_bad_authorship: [400, '잘못된 설정값입니다.'],
}

/** Maps RPC exception codes to HTTP status + Korean copy. Unknown → 500. */
export function anonError(e: unknown): { status: number; error: string } {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  const code = Object.keys(ERRORS).find((k) => msg.includes(k))
  if (code) return { status: ERRORS[code][0], error: ERRORS[code][1] }
  return { status: 500, error: M('처리하지 못했어요. 잠시 후 다시 시도해주세요.') }
}
