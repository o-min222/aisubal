/**
 * A105 화면 피드백 — pure helpers the picker uses (no React, no node:crypto), so they are
 * testable with plain objects: the 7-tap logo counter, a readable CSS selector, element text.
 */

export const FEEDBACK_MODE_KEY = 'aisubal_feedback_mode'
export const FEEDBACK_MODE_EVENT = 'aisubal:feedback-mode'
export const LOGO_TAPS = 7
/** max gap between two logo taps */
export const LOGO_TAP_GAP_MS = 3000
/** toasts start on this tap ("4번 더 누르면 …") */
export const LOGO_TAP_HINT_FROM = 3

export type TapState = { count: number; last: number }
export type TapStep = { state: TapState; remaining: number | null; toggle: boolean; first: boolean }

/** One tap on the logo. `first` = a fresh streak (let the normal navigation happen). */
export function logoTap(prev: TapState, now: number): TapStep {
  const fresh = prev.count === 0 || now - prev.last > LOGO_TAP_GAP_MS || now < prev.last
  const count = fresh ? 1 : prev.count + 1
  if (count >= LOGO_TAPS) return { state: { count: 0, last: 0 }, remaining: null, toggle: true, first: false }
  return { state: { count, last: now }, remaining: count >= LOGO_TAP_HINT_FROM ? LOGO_TAPS - count : null, toggle: false, first: fresh }
}

/* ---------- selector ---------- */

export type NodeLike = {
  tagName: string
  id: string
  classList: Iterable<string>
  parentElement: NodeLike | null
  children?: ArrayLike<NodeLike>
  getAttribute(name: string): string | null
}

// Tailwind / utility / state classes say nothing about which component it is.
const UTILITY = /^(?:-?(?:p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|w|h|min|max|size|flex|grid|gap|text|font|bg|border|rounded|items|justify|content|inline|block|hidden|shadow|space|divide|leading|tracking|overflow|truncate|line|relative|absolute|fixed|sticky|static|inset|top|left|right|bottom|z|opacity|transition|duration|ease|delay|animate|cursor|select|whitespace|break|order|col|row|self|place|object|aspect|ring|outline|sr|only|is|has|tap|shrink|grow|basis|underline|uppercase|lowercase|capitalize|italic|antialiased|pointer|touch|fill|stroke|filter|blur|backdrop|scale|rotate|translate|origin|transform|visible|invisible|container|mx-auto|dark|group|peer|lucide)(?:-|$))/
const looksGenerated = (s: string) => {
  if (s.length > 40 || /^(?:css|sc|jsx|emotion|svelte)-/.test(s) || /\d{3,}|__|«|:r/.test(s)) return true
  const tail = s.split(/[-_]/).pop() ?? ''
  return tail.length >= 5 && /\d/.test(tail) && /[a-z]/i.test(tail)
}

export function stableClasses(el: NodeLike): string[] {
  const out: string[] = []
  for (const c of el.classList) {
    if (!c || /[:\[\]/.!#%@()]/.test(c) || UTILITY.test(c) || looksGenerated(c)) continue
    out.push(c)
    if (out.length === 2) break
  }
  return out
}

const cssEscape = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`)

function part(el: NodeLike): { sel: string; unique: boolean } {
  const tag = el.tagName.toLowerCase()
  if (el.id && !looksGenerated(el.id)) return { sel: `#${cssEscape(el.id)}`, unique: true }
  for (const a of ['data-ui', 'data-testid']) {
    const v = el.getAttribute(a)
    if (v && v.length <= 60) return { sel: `[${a}="${v.replace(/"/g, '\\"')}"]`, unique: false }
  }
  const cls = stableClasses(el)
  let sel = cls.length ? `${tag}.${cls.map(cssEscape).join('.')}` : tag
  const label = el.getAttribute('aria-label')
  if (!cls.length && label && label.length <= 40) sel += `[aria-label="${label.replace(/"/g, '\\"')}"]`
  const sibs = el.parentElement?.children
  if (sibs && sibs.length > 1) {
    const same = Array.from(sibs).filter((s) => s.tagName === el.tagName)
    if (same.length > 1) sel += `:nth-of-type(${same.indexOf(el) + 1})`
  }
  return { sel, unique: false }
}

/** Short, human-readable path: stops at an id or after 5 levels (`main#main > article.post-card > button`). */
export function selectorFor(el: NodeLike | null): string | null {
  const parts: string[] = []
  let cur = el
  while (cur && parts.length < 5) {
    const tag = cur.tagName.toLowerCase()
    if (tag === 'html' || tag === 'body') break
    const p = part(cur)
    parts.unshift(p.sel)
    if (p.unique) break
    cur = cur.parentElement
  }
  return parts.length ? parts.join(' > ').slice(0, 500) : null
}

/** What the element says: aria-label, alt, placeholder, then visible text (collapsed, ≤ 200). */
export function elementTextOf(el: { getAttribute(n: string): string | null; textContent: string | null; innerText?: string }): string | null {
  const raw = el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('placeholder') || el.innerText || el.textContent || ''
  const s = raw.replace(/\s+/g, ' ').trim()
  return s ? (s.length > 200 ? `${s.slice(0, 199)}…` : s) : null
}

/** Nearest `data-ui` name (opt-in component tags); React names are minified in production. */
export function componentOf(el: { closest(sel: string): { getAttribute(n: string): string | null } | null }): string | null {
  return el.closest('[data-ui]')?.getAttribute('data-ui')?.slice(0, 200) ?? null
}
