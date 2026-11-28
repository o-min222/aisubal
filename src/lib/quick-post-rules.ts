import { msg } from '@/i18n/translate'

/** A62: the feed-top one-liner and its starters. Pure rules, shared by the composer and tests. */
export const QUICK_PLACEHOLDER = msg('오늘 써 본 AI, 한 줄이면 충분해요')

/** 'ask' is a toggle (A97): it marks the post as a question instead of typing a sentence; 'shot' opens the image picker */
type QuickStarter = { id: 'ask' | 'tried' | 'chat' | 'shot'; label: string; prefill: string | null }
/** chips under the composer: a starter sentence (never a forced category); 'shot' opens the image picker */
export const QUICK_STARTERS: QuickStarter[] = [
  { id: 'ask', label: msg('질문해요'), prefill: null },
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
