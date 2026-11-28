import { msg } from '@/i18n/translate'

/**
 * A39: emoji reactions. 👍 is the existing like (post_likes); every other emoji is a post_reactions row.
 * Custom emoji are ':shortcode:' strings resolved against the custom_emojis list.
 */
export const THUMBS = '👍'
export const CUSTOM_EMOJI_MAX_BYTES = 256 * 1024
export const CUSTOM_EMOJI_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

export type ReactionSummary = { emoji: string; count: number; mine: boolean }
export type CustomEmoji = { shortcode: string; url: string; mine: boolean }

/** the default picker set; keywords (ko + en) feed search */
const CURATED_EMOJI: Array<{ e: string; k: string }> = [
  { e: '👍', k: '좋아요 최고 like thumbs up yes' },
  { e: '❤️', k: '하트 사랑 heart love' },
  { e: '😂', k: '웃김 ㅋㅋ joy laugh lol' },
  { e: '🎉', k: '축하 파티 party tada congrats' },
  { e: '🔥', k: '불 대박 fire hot lit' },
  { e: '👏', k: '박수 clap applause' },
  { e: '🙏', k: '감사 부탁 thanks pray please' },
  { e: '😮', k: '놀람 wow surprised' },
  { e: '😢', k: '슬픔 sad cry' },
  { e: '🤔', k: '생각 고민 thinking hmm' },
  { e: '👀', k: '눈 보는중 eyes look watching' },
  { e: '💯', k: '백점 완벽 hundred perfect' },
  { e: '✅', k: '확인 완료 check done' },
  { e: '🚀', k: '로켓 출시 rocket ship launch' },
  { e: '💡', k: '아이디어 전구 idea bulb' },
  { e: '🙌', k: '만세 raised hands hooray' },
  { e: '😍', k: '반함 heart eyes' },
  { e: '😅', k: '머쓱 sweat smile' },
  { e: '🥲', k: '웃픈 smiling tear' },
  { e: '😭', k: '오열 sob' },
  { e: '🤯', k: '충격 mind blown' },
  { e: '😎', k: '멋짐 cool sunglasses' },
  { e: '🤖', k: '로봇 에이전트 ai robot bot' },
  { e: '🧠', k: '뇌 똑똑 brain smart' },
  { e: '💪', k: '힘 화이팅 muscle strong' },
  { e: '✨', k: '반짝 sparkles' },
  { e: '⭐', k: '별 star' },
  { e: '🫶', k: '하트손 heart hands' },
  { e: '🤝', k: '악수 협업 handshake deal' },
  { e: '👌', k: '오케이 ok' },
  { e: '🆗', k: '오케이 ok button' },
  { e: '❗', k: '느낌표 중요 exclamation' },
  { e: '❓', k: '물음표 질문 question' },
  { e: '🐛', k: '버그 bug' },
  { e: '🛠️', k: '도구 수리 tools fix' },
  { e: '📌', k: '고정 핀 pin' },
  { e: '☕', k: '커피 coffee' },
  { e: '🍺', k: '맥주 beer' },
  { e: '😴', k: '졸림 sleepy' },
  { e: '🫡', k: '경례 salute' },
]

const PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3/u
const FORBIDDEN = /[A-Za-z\s<>&"'`\\]/

export function isCustomCode(s: string): boolean {
  return /^:[a-z0-9_]{2,32}:$/.test(s)
}

/** what the DB accepts (plus 👍, which routes to likes) */
export function isValidReaction(s: unknown): s is string {
  if (typeof s !== 'string' || !s || s.length > 34) return false
  if (isCustomCode(s)) return true
  return !FORBIDDEN.test(s) && PICTO.test(s)
}

/** "Party Parrot" / ":party:" → "party_parrot"; null when it can't be a shortcode */
export function normalizeShortcode(input: string): string | null {
  const s = input.trim().replace(/^:+|:+$/g, '').toLowerCase().replace(/[\s-]+/g, '_')
  return /^[a-z0-9_]{2,32}$/.test(s) ? s : null
}

/** 👍 first, then by count, then first-seen order (stable) */
export function sortSummary(list: ReactionSummary[]): ReactionSummary[] {
  return list
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(b.r.emoji === THUMBS) - Number(a.r.emoji === THUMBS) || b.r.count - a.r.count || a.i - b.i)
    .map((x) => x.r)
}

/** toggle one emoji in a summary (optimistic UI) */
export function applyToggle(list: ReactionSummary[], emoji: string, on: boolean): ReactionSummary[] {
  const cur = list.find((r) => r.emoji === emoji)
  if (on) {
    if (cur?.mine) return list
    return cur ? list.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r)) : [...list, { emoji, count: 1, mine: true }]
  }
  if (!cur?.mine) return list
  return list.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, mine: false } : r)).filter((r) => r.count > 0)
}

/** picker search over the curated set and custom shortcodes */
export function searchEmoji(q: string, customs: CustomEmoji[]): { curated: string[]; custom: CustomEmoji[] } {
  const t = q.trim().toLowerCase().replace(/^:|:$/g, '')
  if (!t) return { curated: CURATED_EMOJI.map((x) => x.e), custom: customs }
  return {
    curated: CURATED_EMOJI.filter((x) => x.k.toLowerCase().includes(t) || x.e === t).map((x) => x.e),
    custom: customs.filter((c) => c.shortcode.includes(t)),
  }
}

/** DB error → user message key */
export function reactionErrorKey(code: string): string {
  if (code.includes('reaction_limit')) return msg('한 글에 반응은 20개까지예요.')
  if (code.includes('reaction_unknown_emoji')) return msg('없는 이모지예요.')
  if (code.includes('reaction_post_gone')) return msg('삭제된 글이에요.')
  if (code.includes('emoji_limit')) return msg('이모지는 한 사람당 50개까지 올릴 수 있어요.')
  if (code.includes('custom_emojis_pkey') || code.includes('duplicate')) return msg('이미 있는 이름이에요.')
  return msg('반응을 남기지 못했어요.')
}
