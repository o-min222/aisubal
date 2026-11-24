import { msg } from '@/i18n/translate'

/** A64: what a signed-out visitor may see of one popular post (shape returned by landing_peek()). */
export type PeekItem = { line: string; reactions: number; comments: number; days: number }

export const PEEK_TAG = 'landing-peek'
export const PEEK_REVALIDATE_S = 600
export const PEEK_MAX = 5
export const PEEK_LOCK = msg('초대장이 있어야 볼 수 있어요')

/** fixed filler under the blur (never real text), varied per card */
export const PEEK_FILLER = [
  msg('회원들은 자기 AI 워크플로를 솔직하게 나누고 써 본 도구와 설정을 묻고 답해요.'),
  msg('이 아래는 초대받은 회원만 볼 수 있어요. 답글과 반응도 함께 이어져요.'),
  msg('프롬프트 한 줄부터 자동화 후기까지, 안에서는 전부 보여요.'),
]

/** keep only well-formed items (defense in depth: the RPC already returns just these fields) */
export function parsePeek(v: unknown): PeekItem[] {
  if (!Array.isArray(v)) return []
  const out: PeekItem[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    if (typeof o.line !== 'string' || !o.line.trim()) continue
    const n = (k: string) => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? Math.max(0, Math.floor(o[k] as number)) : 0)
    out.push({ line: o.line.slice(0, 61), reactions: n('reactions'), comments: n('comments'), days: n('days') })
    if (out.length >= PEEK_MAX) break
  }
  return out
}
