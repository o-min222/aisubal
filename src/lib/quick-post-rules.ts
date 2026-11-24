import { msg } from '@/i18n/translate'

/** A62: the feed-top one-liner and its starters. Pure rules, shared by the composer and tests. */
export const QUICK_PLACEHOLDER = msg('오늘 써 본 AI, 한 줄이면 충분해요')

export type QuickStarter = { id: 'ask' | 'tried' | 'chat' | 'shot'; label: string; prefill: string | null }
/** chips under the composer: a starter sentence (never a forced category); 'shot' opens the image picker */
export const QUICK_STARTERS: QuickStarter[] = [
  { id: 'ask', label: msg('질문해요'), prefill: msg('혹시 이거 아시는 분? ') },
  { id: 'tried', label: msg('이거 써봤어요'), prefill: msg('오늘 써 본 AI: ') },
  { id: 'chat', label: msg('잡담'), prefill: msg('그냥 잡담인데, ') },
  { id: 'shot', label: msg('스크린샷 한 장'), prefill: null },
]

/** add a starter to what's typed: replaces another starter, never duplicates, keeps the member's own words */
export function applyStarter(body: string, starter: string, all: string[]): string {
  let rest = body
  for (const s of all) if (rest.startsWith(s)) { rest = rest.slice(s.length); break }
  return starter + rest.replace(/^\s+/, '')
}

/** one-line mode posts on Enter; Shift+Enter (or IME composition) never posts */
export function quickShouldSubmit(e: { key: string; shiftKey: boolean; isComposing?: boolean }, body: string): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.isComposing && body.trim().length > 0
}

// ---- 스크린샷 한 장 ----------------------------------------------------------------------
export const POST_IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
export const POST_IMAGE_MAX_BYTES = 4 * 1024 * 1024
/** client-side shrink target before upload (screenshots stay legible) */
export const POST_IMAGE_MAX_SIDE = 2000
const PATH = /^[0-9a-zA-Z-]{1,64}\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/  // the DB requires the real auth uid folder
export function isPostImagePath(p: unknown, authId?: string): p is string {
  return typeof p === 'string' && PATH.test(p) && (!authId || p.startsWith(`${authId}/`))
}
export const postImageSrc = (postId: string) => `/api/post-image/${encodeURIComponent(postId)}`

// ---- 오늘의 질문 -------------------------------------------------------------------------
export type DailyQuestion = { id: string; ko: string; en: string | null; date: string; answered: boolean; answers: number }
export type QuestionTag = { id: string; ko: string; en: string | null; date: string }
export const questionText = (q: { ko: string; en: string | null }, locale: string) => (locale === 'en' && q.en ? q.en : q.ko)
export function parseQuestionTag(v: unknown): QuestionTag | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.ko !== 'string' || typeof o.date !== 'string') return null
  return { id: o.id, ko: o.ko, en: typeof o.en === 'string' ? o.en : null, date: o.date }
}
/** the same rotation as daily_question__for(): day index since 2026-01-01 over the active pool */
export function questionIndex(kstDate: string, n: number): number {
  if (n <= 0) return 0
  const d = Math.round((Date.parse(`${kstDate}T00:00:00Z`) - Date.parse('2026-01-01T00:00:00Z')) / 86400000)
  return ((d % n) + n) % n
}
export function kstDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10)
}
