/** Pure helpers for composer @-autocomplete (tested in tests/mention-suggest.test.ts). */

/** The @token being typed right before the caret, or null. Same boundaries as MentionText. */
export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const m = /(^|[^A-Za-z0-9_@가-힣ㄱ-ㅎㅏ-ㅣ.])@([0-9A-Za-z_가-힣ㄱ-ㅎㅏ-ㅣ]{0,20})$/.exec(before)
  if (!m) return null
  return { start: before.length - m[2].length - 1, query: m[2] }
}

/** Replace the @token at `start` with the picked handle (+ '.ai' for agents) and a trailing space. */
export function applyMention(text: string, start: number, caret: number, pick: { kind: 'member' | 'agent'; handle: string }): { text: string; caret: number } {
  const insert = `@${pick.handle}${pick.kind === 'agent' ? '.ai' : ''} `
  const after = text.slice(caret).replace(/^[0-9A-Za-z_가-힣ㄱ-ㅎㅏ-ㅣ]*/, '')
  const next = text.slice(0, start) + insert + after.replace(/^ /, '')
  return { text: next, caret: start + insert.length }
}

// ---- A27: instant suggestions from the viewer's circle, Korean-aware ----

type Suggest = { kind: 'member' | 'agent'; handle: string; name: string }
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const JAMO = /[ㄱ-ㅎㅏ-ㅣ]/

/** 김민수 → ㄱㅁㅅ (initial consonants; other characters kept, lower-cased). */
export function choseong(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00
    out += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch.toLowerCase()
  }
  return out
}

/** Circle members matching what's typed after @, best first. While an IME is mid-syllable the
 *  trailing jamo is ignored ('김ㅁ' → '김'); a jamo-only query matches initials ('ㄱㅁ' → 김민수). */
export function rankLocal<T extends Suggest>(items: T[], rawQuery: string, limit = 8): T[] {
  const q = rawQuery.normalize('NFC').toLowerCase()
  if (!q) return items.slice(0, limit)
  const jamoOnly = [...q].every((c) => JAMO.test(c))
  const text = jamoOnly ? '' : q.replace(/[ㄱ-ㅎㅏ-ㅣ]+$/, '')
  const scored: Array<[number, number, T]> = []
  items.forEach((it, i) => {
    const h = it.handle.toLowerCase()
    const n = it.name.normalize('NFC').toLowerCase().replace(/\s+/g, '')
    let s = -1
    if (jamoOnly) s = choseong(n).startsWith(q) ? 1 : it.name.split(/\s+/).some((w) => choseong(w).startsWith(q)) ? 3 : -1
    else if (!text) s = 4
    else if (h.startsWith(text)) s = 0
    else if (n.startsWith(text)) s = 1
    else if (h.includes(text)) s = 2
    else if (n.includes(text)) s = 3
    if (s >= 0) scored.push([s, i, it])
  })
  return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, limit).map((x) => x[2])
}

/** Circle hits first, then server hits not already shown. */
export function mergeSuggestions<T extends Suggest>(local: T[], remote: T[], limit = 8): T[] {
  const seen = new Set(local.map((i) => `${i.kind}:${i.handle}`))
  return [...local, ...remote.filter((i) => !seen.has(`${i.kind}:${i.handle}`))].slice(0, limit)
}

/** Where the popover goes: just under the caret line, flipped above it when it would run past
 *  the visible viewport (on phones that bottom is the keyboard's top), clamped horizontally. */
export function placeMentionPopover(
  caret: { x: number; top: number; bottom: number },
  pop: { w: number; h: number },
  vp: { left: number; top: number; w: number; h: number },
  gap = 4,
  margin = 8,
): { left: number; top: number; above: boolean } {
  const left = Math.max(vp.left + margin, Math.min(caret.x, vp.left + vp.w - pop.w - margin))
  const below = caret.bottom + gap
  const fitsBelow = below + pop.h <= vp.top + vp.h - margin
  const aboveTop = caret.top - gap - pop.h
  const above = !fitsBelow && aboveTop >= vp.top + margin
  return { left, top: above ? aboveTop : below, above }
}
