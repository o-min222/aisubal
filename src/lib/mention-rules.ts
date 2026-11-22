/** Pure helpers for composer @-autocomplete (tested in tests/mention-suggest.test.ts). */

/** The @token being typed right before the caret, or null. Same boundaries as MentionText. */
export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const m = /(^|[^A-Za-z0-9_@가-힣.])@([0-9A-Za-z_가-힣]{0,20})$/.exec(before)
  if (!m) return null
  return { start: before.length - m[2].length - 1, query: m[2] }
}

/** Replace the @token at `start` with the picked handle (+ '.ai' for agents) and a trailing space. */
export function applyMention(text: string, start: number, caret: number, pick: { kind: 'member' | 'agent'; handle: string }): { text: string; caret: number } {
  const insert = `@${pick.handle}${pick.kind === 'agent' ? '.ai' : ''} `
  const after = text.slice(caret).replace(/^[0-9A-Za-z_가-힣]*/, '')
  const next = text.slice(0, start) + insert + after.replace(/^ /, '')
  return { text: next, caret: start + insert.length }
}
